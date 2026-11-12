-- Stop workers that can send schedule-derived data and require a new, explicit opt-in.
SELECT pg_advisory_xact_lock(83002);
-- Reconcile fresh installations with the existing hourly production queue.
ALTER TABLE app_private.briefing_jobs ADD COLUMN IF NOT EXISTS run_at timestamptz;
UPDATE app_private.briefing_jobs SET run_at=date_trunc('hour',created_at) WHERE run_at IS NULL;
ALTER TABLE app_private.briefing_jobs ALTER COLUMN run_at SET NOT NULL;
ALTER TABLE app_private.briefing_jobs DROP CONSTRAINT IF EXISTS briefing_jobs_profile_id_day_key;
CREATE UNIQUE INDEX IF NOT EXISTS briefing_jobs_profile_id_run_at_key ON app_private.briefing_jobs(profile_id,run_at);
ALTER TABLE app_private.briefing_posts DROP CONSTRAINT IF EXISTS briefing_posts_profile_id_day_kind_key;

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

UPDATE app_private.briefing_preferences
SET enabled=false,version=version+1,last_state='CONSENT_UPDATE'
WHERE enabled AND consent_version IS DISTINCT FROM 'briefing-2026-11-12-v2';

UPDATE app_private.briefing_jobs
SET state=CASE WHEN state IN ('QUEUED','LEASED') THEN 'CANCELLED' ELSE state END,
    token=NULL,lease_until=NULL,context=NULL,research=NULL
WHERE state IN ('QUEUED','LEASED') OR context IS NOT NULL OR research IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.briefing_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb;who uuid;pref app_private.briefing_preferences%ROWTYPE;cfg app_private.briefing_system%ROWTYPE;
 post app_private.briefing_posts%ROWTYPE;v integer;results jsonb;has_more boolean;today date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF op IN ('briefing.preferences.save','briefing.admin.save') THEN PERFORM pg_advisory_xact_lock(83002); END IF;
 IF op IN ('briefing.admin.read','briefing.admin.save') THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO cfg FROM app_private.briefing_system WHERE id FOR UPDATE;
  IF op='briefing.admin.save' THEN
   IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
   IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR (p->>'version')::integer<>cfg.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF p-ARRAY['enabled','dailyCallLimit','version']<>'{}' OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR (p->>'dailyCallLimit')::int NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.briefing_system SET enabled=(p->>'enabled')::boolean,daily_call_limit=(p->>'dailyCallLimit')::int,version=version+1 WHERE id RETURNING * INTO cfg;
   INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details) VALUES('ADMIN','admin.ai.briefing.settings',app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,'AI 브리핑 배치 운영 설정',jsonb_build_object('enabled',cfg.enabled,'dailyCallLimit',cfg.daily_call_limit));
  END IF;
  RETURN jsonb_build_object('enabled',cfg.enabled,'model',cfg.model,'dailyCallLimit',cfg.daily_call_limit,'version',cfg.version,
  'callsToday',(SELECT count(*) FROM app_private.briefing_usage WHERE day=today),'queued',(SELECT count(*) FROM app_private.briefing_jobs WHERE state IN ('QUEUED','LEASED')),'failed',(SELECT count(*) FROM app_private.briefing_jobs WHERE state='ERROR' AND day=today));
 END IF;
 identity:=app_private.workspace_command('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL OR NOT app_private.briefing_active(who) THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
 INSERT INTO app_private.briefing_preferences(profile_id) VALUES(who) ON CONFLICT DO NOTHING;
 SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=who FOR UPDATE;
 IF op='briefing.preferences.save' THEN
  IF p-ARRAY['enabled','region','consent','consentVersion','version']<>'{}' OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'region') IS DISTINCT FROM 'string' OR length(p->>'region')>60  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR (p->>'version')::int<>pref.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF (p->>'enabled')::boolean AND (p->>'consent' IS DISTINCT FROM 'true' OR p->>'consentVersion' IS DISTINCT FROM 'briefing-2026-11-12-v2' OR length(trim(p->>'region'))<2) THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  UPDATE app_private.briefing_preferences SET enabled=(p->>'enabled')::boolean,region=trim(p->>'region'),consent_version=CASE WHEN (p->>'enabled')::boolean THEN 'briefing-2026-11-12-v2' ELSE NULL END,
  enabled_at=CASE WHEN (p->>'enabled')::boolean AND NOT pref.enabled THEN now() ELSE enabled_at END,version=version+1,last_state=CASE WHEN (p->>'enabled')::boolean THEN 'PENDING' ELSE 'DISABLED' END WHERE profile_id=who RETURNING * INTO pref;
  DELETE FROM app_private.briefing_jobs WHERE profile_id=who;
  -- Withdrawal removes private analyses; usage reservations remain for the daily spending cap.
  IF NOT pref.enabled THEN DELETE FROM app_private.briefing_posts WHERE profile_id=who; END IF;
 ELSIF op='briefing.feedback' THEN
  SELECT * INTO post FROM app_private.briefing_posts WHERE id=(p->>'postId')::uuid AND profile_id=who;
  IF NOT FOUND OR NOT pref.enabled OR EXISTS(SELECT 1 FROM unnest(post.owners) owner WHERE NOT app_private.briefing_can_use(who,owner)) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p-ARRAY['postId','action','value']<>'{}' OR p->>'action' NOT IN ('saved','helpful','hidden') OR jsonb_typeof(p->'value') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.briefing_feedback(post_id) VALUES(post.id) ON CONFLICT DO NOTHING;
  UPDATE app_private.briefing_feedback SET saved=CASE WHEN p->>'action'='saved' THEN (p->>'value')::boolean ELSE saved END,
  helpful=CASE WHEN p->>'action'='helpful' THEN (p->>'value')::boolean ELSE helpful END,hidden=CASE WHEN p->>'action'='hidden' THEN (p->>'value')::boolean ELSE hidden END WHERE post_id=post.id;
  RETURN app_private.briefing_post_json(post);
 ELSIF op<>'briefing.read' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT * INTO cfg FROM app_private.briefing_system WHERE id;
 WITH matching AS (
 SELECT b.* FROM app_private.briefing_posts b LEFT JOIN app_private.briefing_feedback f ON f.post_id=b.id
 WHERE b.profile_id=who AND pref.enabled AND NOT coalesce(f.hidden,false) AND (NOT coalesce((p->>'saved')::boolean,false) OR f.saved)
 AND NOT EXISTS(SELECT 1 FROM unnest(b.owners) owner WHERE NOT app_private.briefing_can_use(who,owner))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.items) item WHERE (item->>'validUntil')::date>=today)
 AND (NOT (p?'cursor') OR (b.updated_at,b.id)<((p->'cursor'->>'updatedAt')::timestamptz,(p->'cursor'->>'id')::uuid))
 ORDER BY b.updated_at DESC,b.id DESC LIMIT 11
 ), numbered AS (SELECT b.*,row_number() OVER(ORDER BY b.updated_at DESC,b.id DESC) n FROM matching b)
 SELECT coalesce(jsonb_agg(app_private.briefing_post_json((SELECT b FROM app_private.briefing_posts b WHERE b.id=n.id)) ORDER BY n.updated_at DESC,n.id DESC) FILTER(WHERE n.n<=10),'[]'),count(*)>10 INTO results,has_more FROM numbered n;
 RETURN jsonb_build_object('updateReceipt',jsonb_build_object('profileId',who,'menu','briefing','revision',coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu='briefing'),0)),'preferences',jsonb_build_object('enabled',pref.enabled,'region',pref.region,'version',pref.version,'lastCheckedAt',pref.last_checked_at,'lastState',pref.last_state,'newContentCount',pref.new_content_count),
 'available',cfg.enabled AND EXISTS(SELECT 1 FROM app_private.ai_provider_settings WHERE id AND ciphertext IS NOT NULL),
 'posts',results,'hasMore',has_more,'nextCursor',CASE WHEN has_more THEN jsonb_build_object('updatedAt',results->9->>'updatedAt','id',results->9->>'id') ELSE NULL END,'serverDay',today);
END $$;
CREATE OR REPLACE FUNCTION app_private.briefing_worker(op text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE d date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
 slot timestamptz:=date_trunc('hour',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
 j app_private.briefing_jobs%ROWTYPE;cfg app_private.briefing_system%ROWTYPE;pref app_private.briefing_preferences%ROWTYPE;
 ctx jsonb;credential app_private.ai_provider_settings%ROWTYPE;result jsonb;it jsonb;post app_private.briefing_posts%ROWTYPE;arr jsonb;kind_name text;changed boolean:=false;used integer;published_count integer:=0;
 regular_items jsonb:='[]';urgent_items jsonb:='[]';
 issue text;retry_pending boolean:=false;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(83002);
 SELECT * INTO cfg FROM app_private.briefing_system WHERE id;
 IF op='claim' THEN RETURN jsonb_build_object('state','CLIENT_OUTDATED'); END IF;
 IF op='enqueue' THEN
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('enqueued',0); END IF;
  -- Expired calendar-day work must not publish or block today's hourly scan.
  UPDATE app_private.briefing_jobs SET state='CANCELLED',token=NULL,lease_until=NULL,context=NULL,research=NULL,error_code='DAY_EXPIRED' WHERE day<d AND state IN ('QUEUED','LEASED');
  INSERT INTO app_private.briefing_jobs(profile_id,day,preference_version,run_at)
  SELECT b.profile_id,d,b.version,slot FROM app_private.briefing_preferences b WHERE b.enabled AND b.consent_version='briefing-2026-11-12-v2'
  AND b.enabled_at<=slot AND app_private.briefing_active(b.profile_id)
  AND NOT EXISTS(SELECT 1 FROM app_private.briefing_jobs q WHERE q.profile_id=b.profile_id AND (q.run_at=slot OR q.state IN ('QUEUED','LEASED'))) ORDER BY b.profile_id LIMIT 100 ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS used=ROW_COUNT;
  DELETE FROM app_private.briefing_jobs WHERE created_at<now()-interval '2 days' AND state NOT IN ('QUEUED','LEASED');
  DELETE FROM app_private.briefing_posts WHERE updated_at<now()-interval '90 days';
  DELETE FROM app_private.briefing_usage WHERE created_at<now()-interval '90 days';
  RETURN jsonb_build_object('enqueued',used);
 ELSIF op='claim.public' THEN
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('state','DISABLED'); END IF;
  SELECT * INTO j FROM app_private.briefing_jobs WHERE day=d AND run_at<=slot AND phase='SEARCH' AND ((state='QUEUED' AND retry_at<=now()) OR (state='LEASED' AND lease_until<now())) ORDER BY retry_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','IDLE'); END IF;
  SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=j.profile_id;
  IF NOT pref.enabled OR pref.consent_version IS DISTINCT FROM 'briefing-2026-11-12-v2' OR pref.version<>j.preference_version OR NOT app_private.briefing_active(j.profile_id) THEN UPDATE app_private.briefing_jobs SET state='CANCELLED' WHERE id=j.id;RETURN jsonb_build_object('state','CANCELLED');END IF;
  ctx:=app_private.briefing_context(j.profile_id,j.day);
  SELECT * INTO credential FROM app_private.ai_provider_settings WHERE id FOR SHARE;
  IF credential.ciphertext IS NULL THEN
   UPDATE app_private.briefing_preferences SET last_state='MISSING_KEY' WHERE profile_id=j.profile_id;
   RETURN jsonb_build_object('state','MISSING_KEY');
  END IF;
  IF j.attempts>=2 THEN UPDATE app_private.briefing_jobs SET state='ERROR',error_code='RETRY_LIMIT' WHERE id=j.id;RETURN jsonb_build_object('state','ERROR');END IF;
  IF (SELECT count(*) FROM app_private.briefing_usage WHERE day=(now() AT TIME ZONE 'Asia/Seoul')::date)>=cfg.daily_call_limit THEN
   UPDATE app_private.briefing_preferences SET last_state='LIMIT' WHERE profile_id=j.profile_id;RETURN jsonb_build_object('state','LIMIT');END IF;
  UPDATE app_private.briefing_jobs SET state='LEASED',token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,
  scope_hash=ctx->>'scope',system_version=cfg.version,credential_version=credential.version WHERE id=j.id RETURNING * INTO j;
  INSERT INTO app_private.briefing_usage(token,job_id,day,phase,model) VALUES(j.token,j.id,(now() AT TIME ZONE 'Asia/Seoul')::date,j.phase,cfg.model);
  RETURN jsonb_build_object('state','LEASED','id',j.id,'token',j.token,'day',j.day,'context',ctx,'model',cfg.model,'ciphertext',credential.ciphertext);
 END IF;
 SELECT * INTO j FROM app_private.briefing_jobs WHERE id=(p->>'id')::uuid AND token=(p->>'token')::uuid AND state='LEASED' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','STALE_LEASE'); END IF;
 SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=j.profile_id;
 SELECT * INTO credential FROM app_private.ai_provider_settings WHERE id FOR SHARE;
 ctx:=app_private.briefing_context(j.profile_id,j.day);
 IF j.day<>d OR NOT cfg.enabled OR cfg.version<>j.system_version OR NOT pref.enabled OR pref.consent_version IS DISTINCT FROM 'briefing-2026-11-12-v2' OR pref.version<>j.preference_version OR credential.version<>j.credential_version OR NOT app_private.briefing_active(j.profile_id) OR ctx->>'scope' IS DISTINCT FROM j.scope_hash THEN
  UPDATE app_private.briefing_jobs SET state='CANCELLED',context=NULL,research=NULL,error_code='CONTEXT_CHANGED' WHERE id=j.id;RETURN jsonb_build_object('state','CANCELLED');END IF;
 issue:=CASE WHEN op='fail' THEN p->>'code' WHEN op='complete' THEN p->>'aiIssue' END;
 IF issue IS NOT NULL THEN
  IF issue NOT IN ('AI_AUTH','AI_LIMIT','AI_UNAVAILABLE','INVALID_RESULT','ENCRYPTION','INVALID_REGION') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  retry_pending:=j.attempts<2 AND issue IN ('AI_LIMIT','AI_UNAVAILABLE','NO_EVIDENCE')
   AND coalesce((p->>'retry')::boolean,op='fail' AND issue IN ('AI_LIMIT','AI_UNAVAILABLE'));
 END IF;
 IF op<>'fail' OR p?'inputTokens' OR p?'outputTokens' THEN
  UPDATE app_private.briefing_usage SET input_tokens=least(greatest(coalesce((p->>'inputTokens')::int,0),0),1000000),output_tokens=least(greatest(coalesce((p->>'outputTokens')::int,0),0),1000000) WHERE token=j.token;
 END IF;
 IF op='fail' THEN
  IF issue IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  UPDATE app_private.briefing_jobs SET state=CASE WHEN retry_pending THEN 'QUEUED' ELSE 'ERROR' END,
   token=NULL,lease_until=NULL,retry_at=now()+interval '5 minutes',error_code=issue WHERE id=j.id;
  UPDATE app_private.briefing_preferences SET last_checked_at=now(),last_state=CASE WHEN issue='INVALID_REGION' THEN 'INVALID_REGION' ELSE 'ERROR' END WHERE profile_id=j.profile_id;
  RETURN jsonb_build_object('state','FAILED','retryScheduled',retry_pending);
 END IF;
 IF op='complete' THEN
  IF jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'items')>6 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF issue IS NOT NULL AND jsonb_array_length(p->'items')=0 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
   IF it->>'category' NOT IN ('FACILITY','NOTICE','EVENT','SAFETY') OR length(it->>'fingerprint')<>64 OR length(it->>'contentHash')<>64 OR (it->>'score')::int NOT BETWEEN 80 AND 100 OR (it->>'validUntil')::date<d OR length(it->>'summary')>500 OR length(it->>'title')>100 OR it->>'sourceUrl' !~ '^https://' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   -- A matching event from another URL updates its original post rather than creating a new one.
   SELECT b.* INTO post FROM app_private.briefing_posts b WHERE b.profile_id=j.profile_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.items) x WHERE (x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category')) ORDER BY b.created_at LIMIT 1 FOR UPDATE;
   IF FOUND THEN
    -- A fallback guide must not overwrite AI coverage of the same source.
    IF it->>'editorialType'='REGIONAL_GUIDE' AND EXISTS(
     SELECT 1 FROM jsonb_array_elements(post.items) x
     WHERE (x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category')
       AND x->>'editorialType' IS DISTINCT FROM 'REGIONAL_GUIDE'
    ) THEN CONTINUE; END IF;
    IF EXISTS(
     SELECT 1 FROM jsonb_array_elements(post.items) x
     WHERE (x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category')
       AND x->>'contentHash' IS DISTINCT FROM it->>'contentHash'
       AND (it->>'editorialType' IS DISTINCT FROM 'REGIONAL_GUIDE'
         OR (x->>'title',x->>'summary',x->>'evidenceQuote',x->'highlights')
           IS DISTINCT FROM (it->>'title',it->>'summary',it->>'evidenceQuote',it->'highlights'))
    ) THEN
     SELECT jsonb_agg(CASE WHEN x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category' THEN it ELSE x END)
     INTO arr FROM jsonb_array_elements(post.items) x;
     UPDATE app_private.briefing_posts SET items=arr,owners=ARRAY(SELECT jsonb_array_elements_text(ctx->'owners')::uuid),updated_at=now() WHERE id=post.id;
     published_count:=published_count+1;
    END IF;
    CONTINUE;
   END IF;
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(regular_items||urgent_items) x
    WHERE x->>'fingerprint'=it->>'fingerprint'
       OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category'
   ) THEN CONTINUE; END IF;
   kind_name:=CASE WHEN (it->>'urgent')::boolean AND it->>'category'='SAFETY' AND (it->>'score')::int>=95 THEN 'URGENT' ELSE 'REGULAR' END;
   IF kind_name='URGENT' THEN
    IF jsonb_array_length(urgent_items)>=3 THEN CONTINUE; END IF;
    urgent_items:=urgent_items||jsonb_build_array(it);
   ELSE
    IF jsonb_array_length(regular_items)>=3 THEN CONTINUE; END IF;
    regular_items:=regular_items||jsonb_build_array(it);
   END IF;
   published_count:=published_count+1;
  END LOOP;
  -- A completed lease publishes at most one post of each kind for this scan.
  INSERT INTO app_private.briefing_posts(profile_id,day,kind,region,items,owners)
  SELECT j.profile_id,j.day,entry.kind,pref.region,entry.items,ARRAY(SELECT jsonb_array_elements_text(ctx->'owners')::uuid)
  FROM (VALUES ('REGULAR',regular_items),('URGENT',urgent_items)) AS entry(kind,items)
  WHERE jsonb_array_length(entry.items)>0;
  changed:=published_count>0;
  UPDATE app_private.briefing_jobs SET state=CASE WHEN retry_pending THEN 'QUEUED' ELSE 'DONE' END,
   token=NULL,lease_until=NULL,retry_at=CASE WHEN retry_pending THEN now()+interval '5 minutes' ELSE retry_at END,
   context=NULL,research=NULL,
   error_code=issue WHERE id=j.id;
  UPDATE app_private.briefing_preferences SET last_checked_at=now(),last_scan_at=j.created_at,last_state=CASE
   WHEN retry_pending THEN 'RETRYING' WHEN issue IS NOT NULL THEN 'PARTIAL'
   WHEN changed THEN 'DONE' ELSE 'EMPTY' END,
  new_content_count=published_count WHERE profile_id=j.profile_id;
  IF changed THEN INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(j.profile_id,'briefing') ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1; END IF;
  RETURN jsonb_build_object('state',CASE WHEN retry_pending THEN 'QUEUED' ELSE 'DONE' END,
   'changed',changed,'retryScheduled',retry_pending);
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $function$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
