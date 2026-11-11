-- UI140: user reports, private review and withdrawal of the matching evidence version.
CREATE TABLE app_private.briefing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES app_private.briefing_posts(id) ON DELETE CASCADE,
  evidence_hash bytea NOT NULL,
  evidence jsonb NOT NULL,
  reason text NOT NULL CHECK (reason IN ('INACCURATE', 'OUTDATED', 'SOURCE', 'OTHER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (post_id, evidence_hash)
);
CREATE INDEX briefing_reports_pending ON app_private.briefing_reports(created_at, id)
  WHERE resolved_at IS NULL;
CREATE INDEX briefing_reports_open_evidence ON app_private.briefing_reports(evidence_hash)
  WHERE resolved_at IS NULL;
CREATE INDEX briefing_posts_evidence ON app_private.briefing_posts USING gin(items jsonb_path_ops);

CREATE TABLE app_private.briefing_withdrawals (
  evidence_hash bytea PRIMARY KEY,
  valid_until date NOT NULL
);

ALTER TABLE app_private.briefing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.briefing_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.briefing_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.briefing_withdrawals FORCE ROW LEVEL SECURITY;
CREATE POLICY briefing_policy ON app_private.briefing_reports TO iharu_policy USING (true) WITH CHECK (true);
CREATE POLICY briefing_policy ON app_private.briefing_withdrawals TO iharu_policy USING (true) WITH CHECK (true);
REVOKE ALL ON app_private.briefing_reports, app_private.briefing_withdrawals FROM PUBLIC, app_runtime, worker_runtime;
GRANT SELECT, INSERT, UPDATE ON app_private.briefing_reports TO iharu_policy;
GRANT SELECT, INSERT, DELETE ON app_private.briefing_withdrawals TO iharu_policy;

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

CREATE FUNCTION app_private.briefing_evidence_key(item jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'fingerprint', item->'fingerprint',
    'contentHash', item->'contentHash',
    'sourceUrl', item->'sourceUrl'
  )
$$;

ALTER FUNCTION app_private.briefing_command(text, jsonb) RENAME TO briefing_command_v139;
REVOKE ALL ON FUNCTION app_private.briefing_command_v139(text, jsonb) FROM PUBLIC, app_runtime, worker_runtime;

CREATE FUNCTION app_private.briefing_command(op text, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  who uuid;
  item jsonb;
  item_key jsonb;
  evidence_hash_value bytea;
  report app_private.briefing_reports%ROWTYPE;
  target_post app_private.briefing_posts%ROWTYPE;
  remaining jsonb;
  removed_count integer := 0;
  decision text := p->>'decision';
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF op NOT IN ('briefing.report', 'briefing.admin.reports', 'briefing.admin.report.resolve') THEN
    RETURN app_private.briefing_command_v139(op, p);
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  IF op = 'briefing.report' THEN
    IF p - ARRAY['postId','fingerprint','contentHash','sourceUrl','reason'] <> '{}'::jsonb
      OR coalesce(p->>'postId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      OR coalesce(p->>'fingerprint','') !~ '^[0-9a-f]{64}$'
      OR coalesce(p->>'contentHash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(p->>'sourceUrl','') !~ '^https://'
      OR length(p->>'sourceUrl') > 2048
      OR coalesce(p->>'reason','') NOT IN ('INACCURATE', 'OUTDATED', 'SOURCE', 'OTHER')
    THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

    who := (app_private.workspace_command('workspace.me', '{}')->>'id')::uuid;
    IF who IS NULL OR NOT app_private.briefing_active(who) THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;

    -- Use the publication lock so consent changes, workers and review cannot race a submission.
    PERFORM pg_advisory_xact_lock(83002);
    item_key := app_private.briefing_evidence_key(p);
    SELECT v.value INTO item
    FROM app_private.briefing_posts b
    JOIN app_private.briefing_preferences pref ON pref.profile_id = b.profile_id
    LEFT JOIN app_private.briefing_feedback f ON f.post_id = b.id
    CROSS JOIN LATERAL jsonb_array_elements(b.items) AS v(value)
    WHERE b.id = (p->>'postId')::uuid AND b.profile_id = who AND pref.enabled
      AND NOT coalesce(f.hidden, false)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(b.owners) AS owner
        WHERE NOT app_private.briefing_can_use(who, owner)
      )
      AND v.value @> item_key AND (v.value->>'validUntil')::date >= today
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

    evidence_hash_value := sha256(convert_to(item_key::text, 'UTF8'));
    INSERT INTO app_private.briefing_reports(post_id, evidence_hash, reason, evidence)
    VALUES (
      (p->>'postId')::uuid, evidence_hash_value, p->>'reason',
      item_key || jsonb_build_object(
        'title', item->'title', 'summary', item->'summary', 'sourceName', item->'sourceName',
        'validFrom', item->'validFrom', 'validUntil', item->'validUntil'
      )
    )
    ON CONFLICT (post_id, evidence_hash) DO NOTHING;
    RETURN jsonb_build_object('received', true);
  END IF;

  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;

  IF op = 'briefing.admin.reports' THEN
    IF p <> '{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    RETURN (
      SELECT jsonb_build_object('reports', coalesce(
        jsonb_agg(
          (evidence - ARRAY['fingerprint', 'contentHash'])
            || jsonb_build_object('id', id, 'reason', reason, 'createdAt', created_at)
          ORDER BY created_at, id
        ), '[]'::jsonb
      ))
      FROM (
        SELECT id, reason, created_at, evidence
        FROM app_private.briefing_reports
        WHERE resolved_at IS NULL
        ORDER BY created_at, id
        LIMIT 20
      ) AS queue
    );
  END IF;

  IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  IF p - ARRAY['reportId','decision'] <> '{}'::jsonb
    OR coalesce(p->>'reportId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(decision,'') NOT IN ('DISMISS', 'WITHDRAW')
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  PERFORM pg_advisory_xact_lock(83002);
  SELECT * INTO report FROM app_private.briefing_reports WHERE id = (p->>'reportId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF report.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'REPORT_RESOLVED'; END IF;

  IF decision = 'WITHDRAW' THEN
    item_key := app_private.briefing_evidence_key(report.evidence);
    INSERT INTO app_private.briefing_withdrawals(evidence_hash, valid_until)
    VALUES (report.evidence_hash, (report.evidence->>'validUntil')::date)
    ON CONFLICT DO NOTHING;

    UPDATE app_private.briefing_reports SET resolved_at = now()
      WHERE evidence_hash = report.evidence_hash AND resolved_at IS NULL;

    FOR target_post IN
      SELECT * FROM app_private.briefing_posts WHERE items @> jsonb_build_array(item_key)
      ORDER BY id FOR UPDATE
    LOOP
      SELECT jsonb_agg(value ORDER BY position) INTO remaining
      FROM jsonb_array_elements(target_post.items) WITH ORDINALITY AS v(value, position)
      WHERE NOT (value @> item_key);
      IF remaining IS NULL THEN
        DELETE FROM app_private.briefing_posts WHERE id = target_post.id;
      ELSE
        UPDATE app_private.briefing_posts SET items = remaining WHERE id = target_post.id;
      END IF;
      removed_count := removed_count + 1;
    END LOOP;
  ELSE
    UPDATE app_private.briefing_reports SET resolved_at = now() WHERE id = report.id;
  END IF;

  INSERT INTO app_private.system_events(category, action, actor_id, request_id, reason, details)
  VALUES (
    'ADMIN', 'admin.ai.briefing.report.' || lower(decision), app_private.actor(),
    nullif(current_setting('iharu.request_id', true), '')::uuid, 'AI 브리핑 정보 신고 처리',
    jsonb_build_object('reportId', report.id, 'reportedReason', report.reason, 'affectedPosts', removed_count)
  );
  RETURN jsonb_build_object('reviewed', true);
END $$;

ALTER FUNCTION app_private.briefing_worker(text, jsonb) RENAME TO briefing_worker_v139;
REVOKE ALL ON FUNCTION app_private.briefing_worker_v139(text, jsonb) FROM PUBLIC, app_runtime, worker_runtime;

CREATE FUNCTION app_private.briefing_worker(op text, p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  remaining jsonb;
BEGIN
  IF op = 'complete' AND jsonb_typeof(p->'items') = 'array' THEN
    IF jsonb_array_length(p->'items') > 6 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    PERFORM pg_advisory_xact_lock(83002);
    SELECT coalesce(jsonb_agg(value ORDER BY position), '[]'::jsonb) INTO remaining
    FROM jsonb_array_elements(p->'items') WITH ORDINALITY AS v(value, position)
    WHERE NOT EXISTS (
      SELECT 1 FROM app_private.briefing_withdrawals
      WHERE evidence_hash = sha256(convert_to(app_private.briefing_evidence_key(v.value)::text, 'UTF8'))
    );
    p := jsonb_set(p, '{items}', remaining);
  ELSIF op = 'enqueue' THEN
    PERFORM pg_advisory_xact_lock(83002);
    DELETE FROM app_private.briefing_withdrawals
    WHERE valid_until < ((now() AT TIME ZONE 'Asia/Seoul') - interval '3 hours')::date;
  END IF;
  RETURN app_private.briefing_worker_v139(op, p);
END $$;

REVOKE ALL ON FUNCTION app_private.briefing_evidence_key(jsonb),
  app_private.briefing_command(text, jsonb), app_private.briefing_worker(text, jsonb)
  FROM PUBLIC, app_runtime, worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.briefing_command(text, jsonb) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_private.briefing_worker(text, jsonb) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
