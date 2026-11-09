-- Store the viewer's timetable preference on their own profile, independently of family-wide data.
ALTER TABLE app_private.workspace_profiles ADD COLUMN timetable_member_id uuid REFERENCES app_private.workspace_profiles(id) ON DELETE SET NULL;
CREATE INDEX workspace_timetable_member ON app_private.workspace_profiles(timetable_member_id) WHERE timetable_member_id IS NOT NULL;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v111;
REVOKE ALL ON FUNCTION app_private.workspace_command_v111(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; who uuid; target uuid;
BEGIN
 IF op NOT IN ('workspace.me','workspace.timetable.preference.save') THEN RETURN app_private.workspace_command_v111(op,p); END IF;
 -- The established me path verifies the session/account, initializes a parent profile,
 -- and preserves suspension checks, child session renewal and family read receipts.
 result:=app_private.workspace_command_v111('workspace.me','{}'::jsonb);
 who:=(result->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.timetable.preference.save' THEN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'memberId') IS DISTINCT FROM 'string' OR p-'memberId'<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  BEGIN target:=(p->>'memberId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_INPUT'; END;
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles WHERE id=target) OR NOT app_private.workspace_can_read(who,target) THEN RAISE EXCEPTION 'ASSIGNEE_INVALID'; END IF;
  UPDATE app_private.workspace_profiles SET timetable_member_id=target WHERE id=who;
  RETURN jsonb_build_object('memberId',target);
 END IF;
 SELECT timetable_member_id INTO target FROM app_private.workspace_profiles WHERE id=who;
 -- A saved preference never grants access. Disconnected/deleted members fall back to self.
 IF target IS NULL OR NOT app_private.workspace_can_read(who,target) THEN target:=who; END IF;
 RETURN result||jsonb_build_object('timetableMemberId',target);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
