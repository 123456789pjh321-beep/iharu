-- Calendar recurrence stays EVENT; timetable REPEAT records remain separate.
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v103;
REVOKE ALL ON FUNCTION app_private.workspace_command_v103(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; events jsonb; who uuid; d jsonb; frequency text; lo date; hi date;
BEGIN
 IF op IN ('workspace.items.create','workspace.items.update') AND p->'data'?'calendarFrequency' THEN
  d:=p->'data';frequency:=d->>'calendarFrequency';
  IF p->>'kind' IS DISTINCT FROM 'EVENT' OR frequency IS NULL OR frequency NOT IN ('ONCE','DAILY','WEEKLY','MONTHLY','YEARLY') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  lo:=(d->>'date')::date;hi:=nullif(d->>'untilDate','')::date;
  IF lo IS NULL OR (frequency<>'ONCE' AND hi<lo) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF frequency='WEEKLY' THEN
   IF jsonb_typeof(d->'weekdays') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF jsonb_array_length(d->'weekdays') NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'weekdays') v WHERE jsonb_typeof(v)<>'number' OR v::text NOT IN ('0','1','2','3','4','5','6')) OR (SELECT count(DISTINCT v) FROM jsonb_array_elements(d->'weekdays') v)<>jsonb_array_length(d->'weekdays') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  ELSE d:=jsonb_set(d,'{weekdays}','[]'::jsonb); END IF;
  IF frequency='ONCE' THEN d:=d-'untilDate'; END IF;
  p:=jsonb_set(p,'{data}',d);
 END IF;
 -- Keep all existing authorization, version, fee handling and update receipts.
 result:=app_private.workspace_command_v103(op,p);
 IF op<>'workspace.items.list' OR coalesce(p->>'kind','EVENT')<>'EVENT' THEN RETURN result; END IF;
 who:=app_private.workspace_actor();
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 lo:=(p->>'from')::date;hi:=(p->>'to')::date;
 IF lo IS NULL OR hi IS NULL OR hi<lo OR hi-lo>370 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'data',i.data,'ownerId',i.owner_id,'ownerName',pp.name,'mine',i.owner_id=who,'version',i.version) ORDER BY i.data->>'date',i.created_at),'[]'::jsonb) INTO events
 FROM app_private.workspace_items i JOIN app_private.workspace_profiles pp ON pp.id=i.owner_id
 WHERE i.kind='EVENT' AND i.deleted_at IS NULL AND app_private.workspace_can_read(who,i.owner_id)
 AND (i.data->>'date')::date<=hi
 AND CASE WHEN coalesce(i.data->>'calendarFrequency','ONCE')='ONCE' THEN (i.data->>'date')::date>=lo ELSE coalesce(nullif(i.data->>'untilDate','')::date,'9999-12-31'::date)>=lo END;
 RETURN jsonb_set(result,'{items}',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(result->'items') v WHERE v->>'kind'<>'EVENT'),'[]'::jsonb)||events);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
