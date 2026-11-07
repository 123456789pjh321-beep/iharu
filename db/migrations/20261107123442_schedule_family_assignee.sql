-- UI77: assignment describes whose schedule it is; ownership never changes.
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v76;
REVOKE ALL ON FUNCTION app_private.workspace_command_v76(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; target uuid; fid uuid;
BEGIN
 IF op IN ('workspace.items.create','workspace.items.update') AND p->'data'->>'assigneeId' IS NOT NULL THEN
  identity:=app_private.workspace_command_v76('workspace.me','{}'::jsonb);
  who:=(identity->>'id')::uuid;target:=(p->'data'->>'assigneeId')::uuid;
  IF target<>who THEN
   SELECT f.id INTO fid FROM app_private.workspace_families f JOIN app_private.workspace_links l ON l.family_id=f.id WHERE l.profile_id=who AND l.active FOR SHARE OF f;
   IF fid IS NULL OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=fid AND profile_id=target AND active) THEN RAISE EXCEPTION 'ASSIGNEE_INVALID'; END IF;
  END IF;
 END IF;
 RETURN app_private.workspace_command_v76(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
