-- P07-F06: opt-in, preview-bound timetable import. No live child or family is seeded.
CREATE TABLE app_private.schedule_template_imports (
 child_id uuid NOT NULL REFERENCES app.children(id) ON DELETE CASCADE,
 row_id text NOT NULL, from_date date NOT NULL, until_date date NOT NULL,
 series_id uuid NOT NULL REFERENCES app.schedule_series(id) ON DELETE CASCADE,
 PRIMARY KEY(child_id,row_id,from_date,until_date), CHECK(until_date>=from_date)
);
CREATE INDEX schedule_template_imports_series ON app_private.schedule_template_imports(series_id);
CREATE TABLE app_private.schedule_template_previews (
 actor_id uuid NOT NULL REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES app.children(id) ON DELETE CASCADE,
 token uuid NOT NULL UNIQUE, payload jsonb NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,child_id)
);
CREATE INDEX schedule_template_previews_child ON app_private.schedule_template_previews(child_id);
-- One short-lived preview per guardian/child, overwritten on each preview.
-- Private tables have no client grants and retain RLS as defense in depth.
ALTER TABLE app_private.schedule_template_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.schedule_template_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.schedule_template_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.schedule_template_previews FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_executor ON app_private.schedule_template_imports TO iharu_policy USING(true) WITH CHECK(true);
CREATE POLICY policy_executor ON app_private.schedule_template_previews TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.schedule_template_imports,app_private.schedule_template_previews FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.schedule_template_imports,app_private.schedule_template_previews TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.schedule_template_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 catalog constant jsonb:='[{"id": "lunch", "title": "점심", "place": "학교", "weekdays": [1, 2, 3, 4, 5], "startTime": "12:10", "endTime": "13:10"}, {"id": "fifth-class", "title": "5교시", "place": "학교", "weekdays": [1, 2, 4], "startTime": "13:10", "endTime": "13:50"}, {"id": "care-long", "title": "돌봄교실", "place": "학교", "weekdays": [1, 2, 4], "startTime": "13:50", "endTime": "14:15"}, {"id": "care-short", "title": "돌봄교실", "place": "학교", "weekdays": [3, 5], "startTime": "13:10", "endTime": "14:15"}, {"id": "logos", "title": "로고스 영어", "place": "14:15 학교 정문 건너편 하교", "weekdays": [1, 3, 5], "startTime": "14:15", "endTime": "16:00"}, {"id": "board-games", "title": "보드게임", "place": "4층 제2영어실", "weekdays": [2], "startTime": "14:15", "endTime": "15:10"}, {"id": "science", "title": "실험과학", "place": "2층 과학실", "weekdays": [4], "startTime": "14:15", "endTime": "15:10"}, {"id": "reading", "title": "리드인독서논술", "place": "", "weekdays": [2, 4], "startTime": "16:00", "endTime": "17:00"}, {"id": "noonnoppi", "title": "눈높이", "place": "", "weekdays": [2, 4], "startTime": "17:10", "endTime": "18:10"}, {"id": "taekwondo", "title": "상무태권도", "place": "", "weekdays": [1, 2, 3, 4, 5], "startTime": "18:10", "endTime": "19:20"}]';
 actor uuid:=app_private.actor();cid uuid:=(p->>'childId')::uuid;
 today date:=(now() AT TIME ZONE 'Asia/Seoul')::date;lo date;hi date;
 child_name text;r jsonb;rows jsonb:='[]';row_state text;sid uuid;count_value integer;
 token_value uuid;preview app_private.schedule_template_previews%ROWTYPE;
 idem app_private.schedule_idempotency%ROWTYPE;key_value text:=p->>'key';
 created_count integer:=0;existing_count integer:=0;series_ids jsonb:='[]';result jsonb;
BEGIN
 IF NOT app_private.guardian_ready() THEN RAISE EXCEPTION 'ACCESS_NOT_READY';END IF;
 IF NOT app_private.child_allowed(cid,'daily') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 -- Match the existing schedule/consent/grant lock order, including concurrent imports.
 SELECT nickname INTO child_name FROM app.children WHERE id=cid FOR UPDATE;
 IF NOT FOUND OR NOT app_private.child_allowed(cid,'daily') OR NOT app_private.guardian_ready() THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF op='template.catalog' THEN RETURN jsonb_build_object('name','서준 시간표','rows',catalog,'serverToday',today);END IF;
 IF op NOT IN ('template.preview','template.import') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF op='template.import' THEN
  IF key_value IS NULL OR length(key_value) NOT BETWEEN 8 AND 128 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(actor::text||':'||key_value,44)) THEN RAISE EXCEPTION 'REQUEST_IN_PROGRESS';END IF;
  DELETE FROM app_private.schedule_idempotency WHERE actor_id=actor AND key=key_value AND expires_at<=now();
  SELECT * INTO idem FROM app_private.schedule_idempotency WHERE actor_id=actor AND key=key_value;
  IF FOUND THEN
   IF idem.operation<>op OR idem.payload IS DISTINCT FROM p-'key' THEN RAISE EXCEPTION 'KEY_REUSED';END IF;
   IF idem.response IS NULL THEN RAISE EXCEPTION 'REQUEST_IN_PROGRESS';END IF;
   RETURN idem.response;
  END IF;
  SELECT * INTO preview FROM app_private.schedule_template_previews WHERE actor_id=actor AND child_id=cid AND token=(p->>'previewToken')::uuid;
  IF NOT FOUND OR preview.expires_at<=now() OR preview.payload IS DISTINCT FROM p-'key'-'previewToken' THEN RAISE EXCEPTION 'PREVIEW_EXPIRED';END IF;
 END IF;
 lo:=(p->>'from')::date;hi:=(p->>'to')::date;
 IF lo IS NULL OR hi IS NULL OR lo<today-90 OR lo>today+365 OR hi<lo OR hi>lo+365 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF jsonb_typeof(p->'rowIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF jsonb_array_length(p->'rowIds') NOT BETWEEN 1 AND 10
 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p->'rowIds'))<>jsonb_array_length(p->'rowIds')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'rowIds') selected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog) t WHERE t->>'id'=selected.value)) THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(catalog) WHERE p->'rowIds' ? (value->>'id') LOOP
  SELECT series_id INTO sid FROM app_private.schedule_template_imports WHERE child_id=cid AND row_id=r->>'id' AND from_date=lo AND until_date=hi;
  row_state:=CASE WHEN sid IS NOT NULL THEN 'EXISTING' ELSE 'NEW' END;
  IF sid IS NULL AND EXISTS(SELECT 1 FROM app_private.schedule_template_imports i JOIN app.schedule_series s ON s.id=i.series_id
   WHERE i.child_id=cid AND i.row_id=r->>'id' AND least(i.from_date,s.first_date)<=hi AND greatest(i.until_date,s.last_date)>=lo) THEN row_state:='OVERLAP';END IF;
  -- Recognize an unchanged, identical plan created manually before this patch too.
  IF row_state='NEW' THEN
   SELECT s.id INTO sid FROM app.schedule_series s JOIN app.schedule_series_versions v ON v.series_id=s.id
   WHERE s.child_id=cid AND s.first_date=lo AND s.last_date=hi AND s.makeup_for_occurrence_id IS NULL
    AND v.from_date=lo AND v.until_date=hi AND v.frequency='WEEKLY' AND v.title=r->>'title' AND v.place=r->>'place'
    AND v.start_time=(r->>'startTime')::time AND v.end_time=(r->>'endTime')::time
    AND v.weekdays @> ARRAY(SELECT jsonb_array_elements_text(r->'weekdays')::int)
    AND v.weekdays <@ ARRAY(SELECT jsonb_array_elements_text(r->'weekdays')::int)
   ORDER BY s.id LIMIT 1;
   IF sid IS NOT NULL THEN row_state:='EXISTING';END IF;
  END IF;
  SELECT count(*) INTO count_value FROM generate_series(0,hi-lo) n WHERE (extract(dow FROM lo+n)::int)=ANY(ARRAY(SELECT jsonb_array_elements_text(r->'weekdays')::int));
  IF count_value=0 THEN RAISE EXCEPTION 'EMPTY_TEMPLATE_RANGE';END IF;
  IF row_state='NEW' AND lo<today THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  rows:=rows||jsonb_build_array(r||jsonb_build_object('state',row_state,'count',count_value,'seriesId',sid));
 END LOOP;
 IF op='template.preview' THEN
  token_value:=gen_random_uuid();
  INSERT INTO app_private.schedule_template_previews(actor_id,child_id,token,payload,expires_at)
   VALUES(actor,cid,token_value,p,now()+interval '5 minutes')
   ON CONFLICT(actor_id,child_id) DO UPDATE SET token=excluded.token,payload=excluded.payload,expires_at=excluded.expires_at;
  RETURN jsonb_build_object('previewToken',token_value,'expiresAt',now()+interval '5 minutes','childName',child_name,'from',lo,'to',hi,'rows',rows,
   'canImport',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE x->>'state'='OVERLAP'));
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE x->>'state'='OVERLAP') THEN RAISE EXCEPTION 'TEMPLATE_PERIOD_OVERLAP';END IF;
 INSERT INTO app_private.schedule_idempotency(actor_id,key,operation,payload) VALUES(actor,key_value,op,p-'key');
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  sid:=(r->>'seriesId')::uuid;
  IF r->>'state'='NEW' THEN
   result:=app_private.schedule_command('create',jsonb_build_object('childId',cid,'title',r->>'title','place',r->>'place','date',lo,'untilDate',hi,
    'startTime',r->>'startTime','endTime',r->>'endTime','frequency','WEEKLY','weekdays',r->'weekdays','holidayPolicy','ASK','key',gen_random_uuid()::text));
   sid:=(result->>'id')::uuid;created_count:=created_count+1;
  ELSE existing_count:=existing_count+1;END IF;
  INSERT INTO app_private.schedule_template_imports(child_id,row_id,from_date,until_date,series_id) VALUES(cid,r->>'id',lo,hi,sid) ON CONFLICT DO NOTHING;
  series_ids:=series_ids||jsonb_build_array(sid);
 END LOOP;
 result:=jsonb_build_object('created',created_count,'existing',existing_count,'seriesIds',series_ids);
 UPDATE app_private.schedule_idempotency SET response=result WHERE actor_id=actor AND key=key_value;
 DELETE FROM app_private.schedule_template_previews WHERE actor_id=actor AND child_id=cid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.schedule_template_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.schedule_template_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

