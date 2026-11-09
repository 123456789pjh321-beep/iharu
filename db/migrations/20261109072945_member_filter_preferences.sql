-- Extend the established per-account timetable preference to independent screen filters.
ALTER TABLE app_private.workspace_profiles ADD COLUMN member_filter_preferences jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(member_filter_preferences)='object');
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
UPDATE app_private.workspace_profiles SET member_filter_preferences=jsonb_build_object(
 'calendar',coalesce(timetable_member_ids,CASE WHEN timetable_member_id IS NOT NULL THEN ARRAY[timetable_member_id] ELSE ARRAY[id] END),
 'home',coalesce(timetable_member_ids,CASE WHEN timetable_member_id IS NOT NULL THEN ARRAY[timetable_member_id] ELSE ARRAY[id] END),
 'fees',coalesce(timetable_member_ids,CASE WHEN timetable_member_id IS NOT NULL THEN ARRAY[timetable_member_id] ELSE ARRAY[id] END),
 'homeFees',coalesce(timetable_member_ids,CASE WHEN timetable_member_id IS NOT NULL THEN ARRAY[timetable_member_id] ELSE ARRAY[id] END));
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v113;
REVOKE ALL ON FUNCTION app_private.workspace_command_v113(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; who uuid; scope text; targets uuid[]; stored jsonb; prefs jsonb;
BEGIN
 IF op NOT IN ('workspace.me','workspace.member-filter.preference.save') THEN RETURN app_private.workspace_command_v113(op,p); END IF;
 result:=app_private.workspace_command_v113('workspace.me','{}'::jsonb);
 who:=(result->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.member-filter.preference.save' THEN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['scope','memberIds']<>'{}'::jsonb
   OR jsonb_typeof(p->'scope') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'memberIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  scope:=p->>'scope';
  IF scope NOT IN ('timetable','calendar','fees','home','homeFees') OR jsonb_array_length(p->'memberIds') NOT BETWEEN 1 AND 100
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'memberIds') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF scope IN ('fees','homeFees') AND result->>'role'<>'PARENT' THEN RAISE EXCEPTION 'FEE_PARENT_REQUIRED'; END IF;
  IF scope='timetable' THEN RETURN app_private.workspace_command_v113('workspace.timetable.preference.save',jsonb_build_object('memberIds',p->'memberIds'))||jsonb_build_object('scope',scope); END IF;
  BEGIN SELECT array_agg(value::uuid ORDER BY ord) INTO targets FROM jsonb_array_elements_text(p->'memberIds') WITH ORDINALITY AS v(value,ord);
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_INPUT'; END;
  IF (SELECT count(DISTINCT id) FROM unnest(targets) id)<>cardinality(targets) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(targets) t(id) WHERE NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles m WHERE m.id=t.id) OR NOT app_private.workspace_can_read(who,t.id)) THEN RAISE EXCEPTION 'ASSIGNEE_INVALID'; END IF;
  UPDATE app_private.workspace_profiles SET member_filter_preferences=jsonb_set(member_filter_preferences,ARRAY[scope],to_jsonb(targets),true) WHERE id=who;
  RETURN jsonb_build_object('scope',scope,'memberIds',targets);
 END IF;
 SELECT member_filter_preferences INTO stored FROM app_private.workspace_profiles WHERE id=who;
 prefs:=jsonb_build_object('timetable',result->'timetableMemberIds');
 FOREACH scope IN ARRAY CASE WHEN result->>'role'='PARENT' THEN ARRAY['calendar','home','fees','homeFees'] ELSE ARRAY['calendar','home'] END LOOP
  SELECT array_agg(v.value::uuid ORDER BY v.ord) INTO targets FROM jsonb_array_elements_text(coalesce(stored->scope,'[]'::jsonb)) WITH ORDINALITY AS v(value,ord)
   WHERE EXISTS(SELECT 1 FROM app_private.workspace_profiles m WHERE m.id=v.value::uuid) AND app_private.workspace_can_read(who,v.value::uuid);
  IF coalesce(cardinality(targets),0)=0 THEN targets:=ARRAY[who]; END IF;
  prefs:=prefs||jsonb_build_object(scope,targets);
 END LOOP;
 RETURN result||jsonb_build_object('memberFilterPreferences',prefs);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
