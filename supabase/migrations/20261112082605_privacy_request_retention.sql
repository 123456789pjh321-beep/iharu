-- Keep resolved rights requests for 90 days and exclude requests with a documented retention hold.
ALTER TABLE app_private.privacy_requests ADD COLUMN retention_hold_ref uuid;
CREATE INDEX privacy_requests_retention
 ON app_private.privacy_requests(updated_at,id)
 WHERE status IN ('COMPLETED','REJECTED') AND retention_hold_ref IS NULL;

GRANT DELETE ON app_private.privacy_requests TO iharu_policy;
GRANT UPDATE (actor_id,target_id,request_id,reason,details) ON app_private.system_events TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

ALTER FUNCTION app_private.legal_command(text,jsonb) RENAME TO legal_command_before_request_retention;
REVOKE ALL ON FUNCTION app_private.legal_command_before_request_retention(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.legal_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE req app_private.privacy_requests%ROWTYPE; result jsonb; reference uuid;
BEGIN
 IF op='legal.admin.requests' THEN
  result:=app_private.legal_command_before_request_retention(op,p);
  RETURN jsonb_build_object('items',coalesce((
   SELECT jsonb_agg(item||CASE WHEN r.retention_hold_ref IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('retentionHoldReference',r.retention_hold_ref) END ORDER BY ordinal)
   FROM jsonb_array_elements(result->'items') WITH ORDINALITY AS items(item,ordinal)
   JOIN app_private.privacy_requests r ON r.id=(item->>'id')::uuid
  ),'[]'::jsonb));
 END IF;
 IF op='legal.admin.retention.hold' THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['id','version','reference']<>'{}'
     OR jsonb_typeof(p->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'version') IS DISTINCT FROM 'number'
     OR NOT (p?'reference') OR jsonb_typeof(p->'reference') NOT IN ('string','null')
     OR (p->>'reference' IS NOT NULL AND p->>'reference' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO req FROM app_private.privacy_requests WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF req.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  reference:=(p->>'reference')::uuid;
  IF req.retention_hold_ref IS DISTINCT FROM reference THEN
   UPDATE app_private.privacy_requests SET retention_hold_ref=reference,version=version+1 WHERE id=req.id;
   INSERT INTO app_private.system_events(category,action,actor_id,target_id,request_id,details)
   VALUES('ADMIN',op,app_private.actor(),req.id,nullif(current_setting('iharu.request_id',true),'')::uuid,
    jsonb_build_object('active',reference IS NOT NULL));
  END IF;
  RETURN jsonb_build_object('held',reference IS NOT NULL);
 END IF;
 RETURN app_private.legal_command_before_request_retention(op,p);
END $$;

ALTER FUNCTION app_private.cron_step(uuid,text) RENAME TO cron_step_before_request_retention;
REVOKE ALL ON FUNCTION app_private.cron_step_before_request_retention(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.cron_step(lease uuid,step text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; expired uuid[]; purged integer;
BEGIN
 result:=app_private.cron_step_before_request_retention(lease,step);
 IF step<>'retention' THEN RETURN result; END IF;

 SELECT array_agg(id) INTO expired FROM (
  SELECT id FROM app_private.privacy_requests
  WHERE status IN ('COMPLETED','REJECTED') AND retention_hold_ref IS NULL
    AND updated_at<=now()-interval '90 days'
  ORDER BY updated_at,id LIMIT 100 FOR UPDATE SKIP LOCKED
 ) batch;
 IF expired IS NULL THEN RETURN result||jsonb_build_object('privacyRequestsPurged',0); END IF;

 -- Keep the administrator's access event, removing the expired case linkage and free text.
 UPDATE app_private.system_events
 SET actor_id=CASE WHEN category='MEMBER' THEN NULL ELSE actor_id END,
     target_id=NULL,request_id=NULL,reason='',details='{}'
 WHERE target_id=ANY(expired)
   AND action IN ('legal.request.create','legal.admin.resolve','legal.admin.retention.hold');
 DELETE FROM app_private.privacy_requests WHERE id=ANY(expired);
 GET DIAGNOSTICS purged=ROW_COUNT;
 RETURN result||jsonb_build_object('privacyRequestsPurged',purged);
END $$;

REVOKE ALL ON FUNCTION app_private.legal_command(text,jsonb),app_private.cron_step(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.legal_command(text,jsonb) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_private.cron_step(uuid,text) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
