-- F03: human review queue. No reviewer is provisioned automatically.
-- Applications deliberately do not grant access_ready, create children or mint consent proofs.
CREATE TABLE app_private.guardian_reviewers (
 member_id uuid PRIMARY KEY REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true, appointed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.guardian_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 target_id uuid NOT NULL DEFAULT gen_random_uuid(), request_key uuid NOT NULL,
 target_label text NOT NULL CHECK(length(target_label) BETWEEN 1 AND 24),
 relationship text NOT NULL CHECK(relationship IN ('PARENT','LEGAL_GUARDIAN')),
 state text NOT NULL DEFAULT 'RECEIVED' CHECK(state IN ('RECEIVED','REVIEWING','APPROVED','REJECTED','EXPIRED')),
 version integer NOT NULL DEFAULT 1, reviewer_id uuid REFERENCES iharu_auth.members(id),
 evidence_ref text UNIQUE, verified_subject_ref text, reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
 UNIQUE(applicant_id,request_key), CHECK(reviewer_id IS DISTINCT FROM applicant_id),
 CHECK(state<>'APPROVED' OR (evidence_ref IS NOT NULL AND verified_subject_ref IS NOT NULL AND reviewer_id IS NOT NULL)),
 CHECK(state<>'REJECTED' OR length(reason) BETWEEN 5 AND 500)
);
CREATE TABLE app_private.guardian_application_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES app_private.guardian_applications(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES iharu_auth.members(id) ON DELETE SET NULL, state text NOT NULL,
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guardian_applicant_created ON app_private.guardian_applications(applicant_id,created_at DESC);
CREATE INDEX guardian_queue ON app_private.guardian_applications(state,created_at);
CREATE INDEX guardian_events_application ON app_private.guardian_application_events(application_id,created_at);
CREATE INDEX guardian_reviewer ON app_private.guardian_applications(reviewer_id);
CREATE INDEX guardian_event_actor ON app_private.guardian_application_events(actor_id);
GRANT SELECT ON app_private.guardian_reviewers TO iharu_policy;
GRANT SELECT,INSERT,UPDATE ON app_private.guardian_applications TO iharu_policy;
GRANT SELECT,INSERT ON app_private.guardian_application_events TO iharu_policy;
ALTER TABLE app_private.guardian_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.guardian_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.guardian_application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY guardian_reviewer_read ON app_private.guardian_reviewers FOR SELECT TO iharu_policy USING(true);
CREATE POLICY guardian_application_executor ON app_private.guardian_applications TO iharu_policy USING(true) WITH CHECK(true);
CREATE POLICY guardian_events_executor ON app_private.guardian_application_events TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.guardian_reviewers,app_private.guardian_applications,app_private.guardian_application_events FROM PUBLIC,app_runtime;
-- Private command boundary follows existing family policy architecture, with an independent
-- HIGH/email session check so an applicant can apply before family access_ready is granted.
CREATE FUNCTION app_private.guardian_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a uuid:=app_private.actor(); reviewer boolean; recent boolean; r app_private.guardian_applications; result jsonb;
BEGIN
 SELECT g.reauthenticated_at>now()-interval '5 minutes' INTO recent
 FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
 JOIN iharu_auth.session s ON s."userId"=u.id JOIN iharu_auth.session_guard g ON g.session_id=s.id
 WHERE m.id=a AND m.status='ACTIVE' AND u."emailVerified" AND u.email NOT LIKE '%@identity.iharu.invalid'
 AND s.id=current_setting('iharu.session_id',true) AND g.assurance='HIGH'
 AND s."expiresAt">now() AND g.absolute_expires_at>now() AND g.last_seen_at>now()-interval '7 days';
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
 SELECT EXISTS(SELECT 1 FROM app_private.guardian_reviewers WHERE member_id=a AND enabled) INTO reviewer;
 IF op NOT IN ('guardian.list','guardian.queue') AND recent IS DISTINCT FROM true THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
 IF op IN ('guardian.queue','guardian.review') AND NOT reviewer THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 -- Serialize submissions per applicant. Expiry is enforced on every read/write, not by a best-effort cron.
 PERFORM pg_advisory_xact_lock(hashtextextended(a::text,703));
 WITH expired AS (
 UPDATE app_private.guardian_applications SET state='EXPIRED',version=version+1,updated_at=now()
 WHERE expires_at<=now() AND state IN ('RECEIVED','REVIEWING','APPROVED') AND (applicant_id=a OR reviewer)
 RETURNING id)
 INSERT INTO app_private.guardian_application_events(application_id,actor_id,state,request_id)
 SELECT id,a,'EXPIRED',current_setting('iharu.request_id')::uuid FROM expired;
 IF op IN ('guardian.list','guardian.queue') THEN
 SELECT coalesce(jsonb_agg(t.data ORDER BY t.created_at DESC),'[]'::jsonb) INTO result FROM (
 SELECT created_at,jsonb_build_object('id',id,'targetId',target_id,'targetLabel',target_label,'relationship',relationship,
 'state',state,'version',version,'createdAt',created_at,'expiresAt',expires_at,'reason',reason,
 'canReview',reviewer AND applicant_id<>a AND (reviewer_id IS NULL OR reviewer_id=a),
 'applicantEmail',CASE WHEN op='guardian.queue' THEN (SELECT u.email FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE m.id=applicant_id) ELSE NULL END) AS data
 FROM app_private.guardian_applications WHERE (op='guardian.list' AND applicant_id=a) OR (op='guardian.queue' AND state IN ('RECEIVED','REVIEWING'))
 ORDER BY created_at DESC LIMIT 100) t;
 RETURN jsonb_build_object('applications',result,'reviewer',reviewer,'reviewAvailable',EXISTS(SELECT 1 FROM app_private.guardian_reviewers WHERE enabled));
 ELSIF op='guardian.submit' THEN
 SELECT * INTO r FROM app_private.guardian_applications WHERE applicant_id=a AND request_key=(p->>'requestKey')::uuid;
 IF FOUND THEN RETURN jsonb_build_object('id',r.id); END IF;
 IF (SELECT count(*) FROM app_private.guardian_applications WHERE applicant_id=a AND state IN ('RECEIVED','REVIEWING','APPROVED'))>=5 THEN RAISE EXCEPTION 'APPLICATION_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.guardian_applications WHERE applicant_id=a AND target_label=p->>'targetLabel' AND state IN ('RECEIVED','REVIEWING','APPROVED')) THEN RAISE EXCEPTION 'APPLICATION_DUPLICATE'; END IF;
 INSERT INTO app_private.guardian_applications(applicant_id,request_key,target_label,relationship)
 VALUES(a,(p->>'requestKey')::uuid,p->>'targetLabel',p->>'relationship') RETURNING * INTO r;
 ELSIF op='guardian.review' THEN
 SELECT * INTO r FROM app_private.guardian_applications WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF r.applicant_id=a OR (r.reviewer_id IS NOT NULL AND r.reviewer_id<>a) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF r.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF r.expires_at<=now() OR NOT ((r.state='RECEIVED' AND p->>'state'='REVIEWING') OR (r.state='REVIEWING' AND p->>'state' IN ('APPROVED','REJECTED'))) THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF p->>'state'='APPROVED' AND (p->>'evidenceChecked' IS DISTINCT FROM 'true' OR (p->>'targetId')::uuid IS DISTINCT FROM r.target_id
 OR coalesce(p->>'evidenceRef','')!~'^[A-Za-z0-9:_-]{8,120}$' OR coalesce(p->>'subjectRef','')!~'^[A-Za-z0-9:_-]{8,120}$') THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED'; END IF;
 IF p->>'state'='REJECTED' AND coalesce(length(trim(p->>'reason')),0) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 UPDATE app_private.guardian_applications SET state=p->>'state',reviewer_id=a,version=version+1,updated_at=now(),
 evidence_ref=CASE WHEN p->>'state'='APPROVED' THEN p->>'evidenceRef' ELSE evidence_ref END,
 verified_subject_ref=CASE WHEN p->>'state'='APPROVED' THEN p->>'subjectRef' ELSE verified_subject_ref END,
 reason=CASE WHEN p->>'state'='REJECTED' THEN trim(p->>'reason') ELSE NULL END,
 expires_at=CASE WHEN p->>'state'='APPROVED' THEN now()+interval '30 days' ELSE expires_at END
 WHERE id=r.id RETURNING * INTO r;
 ELSE RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 INSERT INTO app_private.guardian_application_events(application_id,actor_id,state,request_id)
 VALUES(r.id,a,r.state,current_setting('iharu.request_id')::uuid);
 RETURN jsonb_build_object('id',r.id,'state',r.state);
END $$;
-- Revoke before transferring ownership: migration_admin may not inherit iharu_policy.
REVOKE ALL ON FUNCTION app_private.guardian_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.guardian_command(text,jsonb) TO app_runtime;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
ALTER FUNCTION app_private.guardian_command(text,jsonb) OWNER TO iharu_policy;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

