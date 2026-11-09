-- Event duration is independent of recurrence cutoff. Old rows remain same-day events.
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v110;
REVOKE ALL ON FUNCTION app_private.workspace_command_v110(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; events jsonb; who uuid; d jsonb; first_day date; last_day date; lo date; hi date;
BEGIN
 IF op IN ('workspace.items.create','workspace.items.update') THEN
  d:=p->'data';
  IF d?'endDate' AND p->>'kind' IS DISTINCT FROM 'EVENT' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p->>'kind'='EVENT' THEN
   first_day:=(d->>'date')::date;last_day:=coalesce((d->>'endDate')::date,first_day);
   IF first_day IS NULL OR last_day<first_day OR (d?'endDate' AND (jsonb_typeof(d->'endDate') IS DISTINCT FROM 'string' OR (d->>'endDate') !~ '^\d{4}-\d{2}-\d{2}$')) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF NOT coalesce((d->>'allDay')::boolean,false) AND (coalesce(d->>'startTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' OR coalesce(d->>'endTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' OR (last_day=first_day AND d->>'endTime'<=d->>'startTime')) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   p:=jsonb_set(p,'{data}',jsonb_set(d,'{endDate}',to_jsonb(last_day::text)));
  END IF;
 END IF;
 -- Preserve author/version checks, family permissions, push capture and menu receipts.
 result:=app_private.workspace_command_v110(op,p);
 IF op<>'workspace.items.list' OR coalesce(p->>'kind','EVENT')<>'EVENT' THEN RETURN result; END IF;
 who:=app_private.workspace_actor();
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 lo:=(p->>'from')::date;hi:=(p->>'to')::date;
 IF lo IS NULL OR hi IS NULL OR hi<lo OR hi-lo>370 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'data',i.data,'ownerId',i.owner_id,'ownerName',pp.name,'mine',i.owner_id=who,'version',i.version) ORDER BY i.data->>'date',i.created_at),'[]'::jsonb) INTO events
 FROM app_private.workspace_items i JOIN app_private.workspace_profiles pp ON pp.id=i.owner_id
 WHERE i.kind='EVENT' AND i.deleted_at IS NULL AND app_private.workspace_can_read(who,i.owner_id)
 AND (i.data->>'date')::date<=hi
 AND CASE WHEN coalesce(i.data->>'calendarFrequency','ONCE')='ONCE'
  THEN coalesce((i.data->>'endDate')::date,(i.data->>'date')::date)>=lo
  ELSE nullif(i.data->>'untilDate','') IS NULL OR (i.data->>'untilDate')::date+(coalesce((i.data->>'endDate')::date,(i.data->>'date')::date)-(i.data->>'date')::date)>=lo END;
 RETURN jsonb_set(result,'{items}',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(result->'items') v WHERE v->>'kind'<>'EVENT'),'[]'::jsonb)||events);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
-- workspace_push_occurs deliberately continues to match occurrence STARTS only.
-- A continued day must not generate another start reminder.
