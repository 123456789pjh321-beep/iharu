-- UI136: each participant can leave an optional room. Default chat has no room row.
ALTER TABLE app_private.workspace_chat_members ADD COLUMN left_at timestamptz;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.workspace_room_member(who uuid,rid uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM app_private.workspace_chat_rooms r
  JOIN app_private.workspace_chat_members m ON m.room_id=r.id AND m.profile_id=who AND m.left_at IS NULL
  JOIN app_private.workspace_links l ON l.family_id=r.family_id AND l.profile_id=m.profile_id AND l.active AND l.version=m.link_version
  WHERE r.id=rid)
$$;
REVOKE ALL ON FUNCTION app_private.workspace_room_member(uuid,uuid) FROM PUBLIC,app_runtime;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v135;
REVOKE ALL ON FUNCTION app_private.workspace_command_v135(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; rid uuid; fid uuid; departed timestamptz;
BEGIN
 IF op<>'workspace.chat.room.leave' THEN RETURN app_private.workspace_command_v135(op,p); END IF;
 identity:=app_private.workspace_command_v135('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['roomId']<>'{}'::jsonb OR jsonb_typeof(p->'roomId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 BEGIN rid:=(p->>'roomId')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_INPUT';END;
 SELECT r.family_id INTO fid FROM app_private.workspace_chat_rooms r JOIN app_private.workspace_chat_members m ON m.room_id=r.id AND m.profile_id=who WHERE r.id=rid;
 IF fid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Same lock order as creating/removing group members. Sends hold this row FOR SHARE.
 PERFORM id FROM app_private.workspace_families WHERE id=fid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT m.left_at INTO departed FROM app_private.workspace_chat_members m WHERE m.room_id=rid AND m.profile_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF departed IS NOT NULL THEN RETURN jsonb_build_object('id',rid,'left',true); END IF;
 IF NOT app_private.workspace_room_member(who,rid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 UPDATE app_private.workspace_chat_members SET left_at=now() WHERE room_id=rid AND profile_id=who;
 -- A subsequent direct conversation creates a fresh room; leaving never restores old history.
 UPDATE app_private.workspace_chat_rooms SET direct_key=NULL WHERE id=rid AND kind='DIRECT';
 RETURN jsonb_build_object('id',rid,'left',true);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
