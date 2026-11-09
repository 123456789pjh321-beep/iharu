-- Hosted cron fallback for reminders and retry delivery. Local WASM tests have no network extensions.
-- The bearer secret is provisioned separately in Vault; never store it in source or cron.job.
DO $migration$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') AND EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_net') THEN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXECUTE $definition$
  CREATE OR REPLACE FUNCTION app_private.dispatch_workspace_push() RETURNS bigint
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $function$
  DECLARE worker_secret text; request_id bigint;
  BEGIN
   SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets WHERE name='iharu_push_cron_secret' LIMIT 1;
   IF worker_secret IS NULL THEN RETURN NULL; END IF;
   SELECT net.http_post(url:='https://myiharu.com/api/cron/push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=45000) INTO request_id;
   RETURN request_id;
  END $function$;
  $definition$;
  REVOKE ALL ON FUNCTION app_private.dispatch_workspace_push() FROM PUBLIC,app_runtime,iharu_policy,anon,authenticated;
  PERFORM cron.schedule('iharu-calendar-chat-push','* * * * *','SELECT app_private.dispatch_workspace_push()');
 END IF;
END $migration$;
