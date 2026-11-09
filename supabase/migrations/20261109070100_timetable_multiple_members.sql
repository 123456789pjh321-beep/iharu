-- Preserve single-member preferences while allowing a private, per-account selection set.
ALTER TABLE app_private.workspace_profiles ADD COLUMN timetable_member_ids uuid[]
 CHECK(timetable_member_ids IS NULL OR (cardinality(timetable_member_ids) BETWEEN 1 AND 100 AND array_position(timetable_member_ids,NULL) IS NULL));
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
UPDATE app_private.workspace_profiles SET timetable_member_ids=ARRAY[timetable_member_id] WHERE timetable_member_id IS NOT NULL;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v112;
REVOKE ALL ON FUNCTION app_private.workspace_command_v112(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; who uuid; targets uuid[]; selected jsonb;
BEGIN
 IF op NOT IN ('workspace.me','workspace.timetable.preference.save') THEN RETURN app_private.workspace_command_v112(op,p); END IF;
 result:=app_private.workspace_command_v112('workspace.me','{}'::jsonb);
 who:=(result->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.timetable.preference.save' THEN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p ? 'memberIds' THEN
   IF p-'memberIds'<>'{}'::jsonb OR jsonb_typeof(p->'memberIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   selected:=p->'memberIds';
  ELSE
   -- Older open tabs can continue saving one person until refreshed.
   IF p-'memberId'<>'{}'::jsonb OR jsonb_typeof(p->'memberId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   selected:=jsonb_build_array(p->'memberId');
  END IF;
  IF jsonb_array_length(selected) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  BEGIN SELECT array_agg(value::uuid ORDER BY ord) INTO targets FROM jsonb_array_elements_text(selected) WITH ORDINALITY AS v(value,ord);
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_INPUT'; END;
  IF (SELECT count(DISTINCT id) FROM unnest(targets) id)<>cardinality(targets) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  -- Reject the entire request if even one member is outside the caller's current family.
  IF EXISTS(SELECT 1 FROM unnest(targets) AS t(id) WHERE NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles p WHERE p.id=t.id) OR NOT app_private.workspace_can_read(who,t.id)) THEN RAISE EXCEPTION 'ASSIGNEE_INVALID'; END IF;
  UPDATE app_private.workspace_profiles SET timetable_member_ids=targets,timetable_member_id=targets[1] WHERE id=who;
  RETURN jsonb_build_object('memberIds',targets,'memberId',targets[1]);
 END IF;
 SELECT coalesce(timetable_member_ids,CASE WHEN timetable_member_id IS NOT NULL THEN ARRAY[timetable_member_id] END) INTO targets FROM app_private.workspace_profiles WHERE id=who;
 SELECT array_agg(t.id ORDER BY t.ord) INTO targets FROM unnest(targets) WITH ORDINALITY AS t(id,ord)
  WHERE EXISTS(SELECT 1 FROM app_private.workspace_profiles p WHERE p.id=t.id) AND app_private.workspace_can_read(who,t.id);
 -- Retain accessible selections; fall back to self only if none remain.
 IF coalesce(cardinality(targets),0)=0 THEN targets:=ARRAY[who]; END IF;
 RETURN result||jsonb_build_object('timetableMemberIds',targets,'timetableMemberId',targets[1]);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
