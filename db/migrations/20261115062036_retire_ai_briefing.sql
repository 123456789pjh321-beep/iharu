-- Serialize with in-flight briefing claims and completions during the rollout.
SELECT pg_advisory_xact_lock(83002);

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

UPDATE app_private.briefing_system
SET enabled=false,version=version+1
WHERE id AND enabled;

UPDATE app_private.briefing_jobs
SET state='CANCELLED',token=NULL,lease_until=NULL,context=NULL,research=NULL,error_code='FEATURE_RETIRED'
WHERE state IN ('QUEUED','LEASED');

REVOKE ALL ON FUNCTION app_private.briefing_command(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;
REVOKE ALL ON FUNCTION app_private.ai_credentials_command(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;
REVOKE ALL ON FUNCTION app_private.briefing_worker(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;

-- Run the previous expiry rules from the existing leased maintenance step.
ALTER FUNCTION app_private.cron_step(uuid,text) RENAME TO cron_step_before_briefing_retirement;
REVOKE ALL ON FUNCTION app_private.cron_step_before_briefing_retirement(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.cron_step(lease uuid, step text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; expired_jobs integer; expired_posts integer; expired_usage integer;
BEGIN
 result:=app_private.cron_step_before_briefing_retirement(lease,step);
 IF step<>'retention' THEN RETURN result; END IF;

 DELETE FROM app_private.briefing_jobs WHERE id IN (
  SELECT id FROM app_private.briefing_jobs WHERE created_at<now()-interval '2 days'
  ORDER BY created_at,id LIMIT 200 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS expired_jobs=ROW_COUNT;

 DELETE FROM app_private.briefing_posts WHERE id IN (
  SELECT id FROM app_private.briefing_posts WHERE updated_at<now()-interval '90 days'
  ORDER BY updated_at,id LIMIT 200 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS expired_posts=ROW_COUNT;

 DELETE FROM app_private.briefing_usage WHERE token IN (
  SELECT token FROM app_private.briefing_usage WHERE created_at<now()-interval '90 days'
  ORDER BY created_at,token LIMIT 200 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS expired_usage=ROW_COUNT;

 RETURN result||jsonb_build_object('retiredBriefing',jsonb_build_object(
  'jobs',expired_jobs,'posts',expired_posts,'usage',expired_usage
 ));
END $$;

REVOKE ALL ON FUNCTION app_private.cron_step(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.cron_step(uuid,text) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
