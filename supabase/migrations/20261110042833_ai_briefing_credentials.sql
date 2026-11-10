-- UI137: encrypted server-only provider credentials, separate from all group data.
CREATE TABLE app_private.ai_provider_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),version integer NOT NULL DEFAULT 0,
 ciphertext text,fingerprint text,updated_at timestamptz,updated_by uuid,
 last_checked_at timestamptz,last_check text CHECK(last_check IN ('OK','AUTH','LIMIT','UNAVAILABLE')),
 CHECK((ciphertext IS NULL)=(fingerprint IS NULL))
);
INSERT INTO app_private.ai_provider_settings(id) VALUES(true);
ALTER TABLE app_private.ai_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_provider_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_settings_policy ON app_private.ai_provider_settings TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.ai_provider_settings FROM PUBLIC,app_runtime;
GRANT SELECT,UPDATE ON app_private.ai_provider_settings TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.ai_credentials_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app_private.ai_provider_settings%ROWTYPE; v integer; action_name text;
BEGIN
 IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF op IN ('ai.credentials.read','ai.credentials.get') THEN
  IF p<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO s FROM app_private.ai_provider_settings WHERE id;
  IF op='ai.credentials.get' THEN
   IF s.ciphertext IS NULL THEN RAISE EXCEPTION 'AI_KEY_MISSING'; END IF;
   RETURN jsonb_build_object('ciphertext',s.ciphertext,'version',s.version);
  END IF;
 ELSIF op IN ('ai.credentials.save','ai.credentials.remove','ai.credentials.checked') THEN
  PERFORM pg_advisory_xact_lock(83001);
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF op<>'ai.credentials.checked' AND NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR (p->>'version') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  v:=(p->>'version')::integer;
  SELECT * INTO s FROM app_private.ai_provider_settings WHERE id FOR UPDATE;
  IF s.version<>v THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF op='ai.credentials.save' THEN
   IF p-ARRAY['version','ciphertext','fingerprint']<>'{}'::jsonb OR length(coalesce(p->>'ciphertext','')) NOT BETWEEN 60 AND 2048 OR coalesce(p->>'ciphertext','') !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{22}$' OR coalesce(p->>'fingerprint','') !~ '^[a-f0-9]{8}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.ai_provider_settings SET ciphertext=p->>'ciphertext',fingerprint=p->>'fingerprint',version=version+1,updated_at=now(),updated_by=app_private.actor(),last_checked_at=NULL,last_check=NULL WHERE id;
   action_name:='admin.ai.key.save';
  ELSIF op='ai.credentials.remove' THEN
   IF p-ARRAY['version']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.ai_provider_settings SET ciphertext=NULL,fingerprint=NULL,version=version+1,updated_at=now(),updated_by=app_private.actor(),last_checked_at=NULL,last_check=NULL WHERE id;
   action_name:='admin.ai.key.remove';
  ELSE
   IF p-ARRAY['version','result']<>'{}'::jsonb OR coalesce(p->>'result','') NOT IN ('OK','AUTH','LIMIT','UNAVAILABLE') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF s.ciphertext IS NULL THEN RAISE EXCEPTION 'AI_KEY_MISSING'; END IF;
   UPDATE app_private.ai_provider_settings SET last_checked_at=now(),last_check=p->>'result' WHERE id;
   action_name:='admin.ai.key.checked';
  END IF;
  INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details)
   VALUES('ADMIN',action_name,app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,'AI 브리핑 OpenAI 연동 설정',jsonb_build_object('result',CASE WHEN op='ai.credentials.checked' THEN p->>'result' ELSE 'UPDATED' END));
  SELECT * INTO s FROM app_private.ai_provider_settings WHERE id;
 ELSE RAISE EXCEPTION 'INVALID_INPUT';
 END IF;
 RETURN jsonb_build_object('configured',s.ciphertext IS NOT NULL,'fingerprint',s.fingerprint,'version',s.version,'updatedAt',s.updated_at,'lastCheckedAt',s.last_checked_at,'lastCheck',s.last_check);
END $$;
REVOKE ALL ON FUNCTION app_private.ai_credentials_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.ai_credentials_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
