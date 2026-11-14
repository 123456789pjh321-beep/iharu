-- Use the existing cron lease to remove expired authentication material.
CREATE INDEX iharu_auth_verification_expiry ON iharu_auth.verification ("expiresAt",id);
CREATE INDEX iharu_auth_phone_challenges_expiry ON iharu_auth.phone_challenges (expires_at,key);
CREATE INDEX iharu_auth_email_links_expiry ON iharu_auth.email_links (expires_at,token_hash);
CREATE INDEX iharu_auth_session_expiry ON iharu_auth.session ("expiresAt",id);
CREATE INDEX iharu_auth_session_guard_idle ON iharu_auth.session_guard (last_seen_at,session_id);

GRANT SELECT (id,"expiresAt") ON iharu_auth.verification TO iharu_policy;
GRANT SELECT (key,expires_at) ON iharu_auth.phone_challenges TO iharu_policy;
GRANT SELECT (token_hash,expires_at) ON iharu_auth.email_links TO iharu_policy;
GRANT DELETE ON iharu_auth.verification,iharu_auth.phone_challenges,iharu_auth.email_links TO iharu_policy;
GRANT DELETE ON iharu_auth.session TO iharu_policy;
-- Locking clauses require UPDATE on at least one column. No row is updated by this job.
GRANT UPDATE ("expiresAt") ON iharu_auth.verification,iharu_auth.session TO iharu_policy;
GRANT UPDATE (expires_at) ON iharu_auth.phone_challenges,iharu_auth.email_links TO iharu_policy;
GRANT UPDATE (last_seen_at) ON iharu_auth.session_guard TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

ALTER FUNCTION app_private.cron_step(uuid,text) RENAME TO cron_step_before_auth_retention;
REVOKE ALL ON FUNCTION app_private.cron_step_before_auth_retention(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.cron_step(lease uuid, step text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 result jsonb;
 verification_count integer;
 phone_count integer;
 email_count integer;
 expired_session_count integer;
 idle_session_count integer;
BEGIN
 result:=app_private.cron_step_before_auth_retention(lease,step);
 IF step<>'retention' THEN RETURN result; END IF;

 DELETE FROM iharu_auth.verification WHERE id IN (
  SELECT id FROM iharu_auth.verification WHERE "expiresAt"<=now()
  ORDER BY "expiresAt",id LIMIT 100 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS verification_count=ROW_COUNT;

 DELETE FROM iharu_auth.phone_challenges WHERE key IN (
  SELECT key FROM iharu_auth.phone_challenges WHERE expires_at<=now()
  ORDER BY expires_at,key LIMIT 100 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS phone_count=ROW_COUNT;

 DELETE FROM iharu_auth.email_links WHERE token_hash IN (
  SELECT token_hash FROM iharu_auth.email_links WHERE expires_at<=now()
  ORDER BY expires_at,token_hash LIMIT 100 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS email_count=ROW_COUNT;

 DELETE FROM iharu_auth.session WHERE id IN (
  SELECT id FROM iharu_auth.session WHERE "expiresAt"<=now()
  ORDER BY "expiresAt",id LIMIT 100 FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS expired_session_count=ROW_COUNT;

 -- Lock the guard too, so a concurrent touch cannot refresh a selected session.
 DELETE FROM iharu_auth.session WHERE id IN (
  SELECT s.id FROM iharu_auth.session s JOIN iharu_auth.session_guard g ON g.session_id=s.id
  WHERE g.last_seen_at<=now()-interval '7 days' OR g.absolute_expires_at<=now()
  ORDER BY g.last_seen_at,s.id LIMIT 100 FOR UPDATE OF s,g SKIP LOCKED
 );
 GET DIAGNOSTICS idle_session_count=ROW_COUNT;

 RETURN result||jsonb_build_object('authArtifactsPurged',jsonb_build_object(
  'verification',verification_count,'phoneChallenges',phone_count,'pendingEmailLinks',email_count,
  'sessions',expired_session_count+idle_session_count
 ));
END $$;

REVOKE ALL ON FUNCTION app_private.cron_step(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.cron_step(uuid,text) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
