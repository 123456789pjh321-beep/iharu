-- Independent journals. Photos are private bytes, never public object URLs.
CREATE TABLE app_private.workspace_memos (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 data jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(char_length(data->>'title') BETWEEN 1 AND 100),CHECK(char_length(data->>'body')<=10000),
 CHECK(data->>'category' IN ('DAILY','FAMILY','LEARNING','OUTING','HEALTH','IDEA','OTHER')),
 CHECK(data->>'visibility' IN ('PRIVATE','GROUP'))
);
CREATE INDEX workspace_memos_owner_date ON app_private.workspace_memos(owner_id,(data->>'date'),id);
CREATE TABLE app_private.workspace_memo_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), memo_id uuid NOT NULL REFERENCES app_private.workspace_memos(id) ON DELETE CASCADE,
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 4 AND 350000),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 1600),height integer NOT NULL CHECK(height BETWEEN 1 AND 1600),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 2)
);
CREATE INDEX workspace_memo_photo_note ON app_private.workspace_memo_photos(memo_id);
CREATE TABLE app_private.workspace_memo_favorites (
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 memo_id uuid NOT NULL REFERENCES app_private.workspace_memos(id) ON DELETE CASCADE,
 PRIMARY KEY(profile_id,memo_id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_memos','workspace_memo_photos','workspace_memo_favorites'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY memo_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_memo_json(m app_private.workspace_memos,who uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.data||jsonb_build_object('id',m.id,'ownerId',m.owner_id,'ownerName',(SELECT name FROM app_private.workspace_profiles WHERE id=m.owner_id),
 'mine',m.owner_id=who,'version',m.version,'createdAt',m.created_at,'updatedAt',m.updated_at,
 'favorite',EXISTS(SELECT 1 FROM app_private.workspace_memo_favorites WHERE profile_id=who AND memo_id=m.id),
 'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'width',width,'height',height) ORDER BY position),'[]') FROM app_private.workspace_memo_photos WHERE memo_id=m.id))
$$;
CREATE FUNCTION app_private.workspace_memo_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; m app_private.workspace_memos; photo app_private.workspace_memo_photos;
 result jsonb; fields jsonb; part jsonb; bytes bytea; photo_id uuid; kept uuid[]='{}'; pos integer=0;
 required_publication uuid; target_id uuid; expected integer;
BEGIN
 identity:=app_private.workspace_command('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.memos.list' THEN
  IF coalesce((p->>'limit')::int,40) NOT BETWEEN 1 AND 100 OR coalesce((p->>'offset')::int,0) NOT BETWEEN 0 AND 100000
    OR char_length(coalesce(p->>'query',''))>100 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  WITH visible AS MATERIALIZED (
   SELECT n.* FROM app_private.workspace_memos n WHERE n.owner_id=who OR n.data->>'visibility'='GROUP' AND app_private.workspace_can_read(who,n.owner_id)
  ), filtered AS MATERIALIZED (
   SELECT n.* FROM visible n WHERE
    (NOT p?'from' OR n.data->>'date'>=p->>'from') AND (NOT p?'to' OR n.data->>'date'<=p->>'to')
    AND (coalesce(p->>'category','ALL')='ALL' OR n.data->>'category'=p->>'category')
    AND (coalesce(p->>'visibility','ALL')='ALL' OR n.data->>'visibility'=p->>'visibility')
    AND (coalesce(jsonb_array_length(p->'ownerIds'),0)=0 OR p->'ownerIds' @> to_jsonb(ARRAY[n.owner_id::text]))
    AND (NOT coalesce((p->>'hasPhotos')::boolean,false) OR EXISTS(SELECT 1 FROM app_private.workspace_memo_photos WHERE memo_id=n.id))
    AND (NOT coalesce((p->>'hasLocation')::boolean,false) OR n.data->'location'<>'null'::jsonb OR n.data->>'place'<>'')
    AND (NOT coalesce((p->>'favorite')::boolean,false) OR EXISTS(SELECT 1 FROM app_private.workspace_memo_favorites WHERE profile_id=who AND memo_id=n.id))
    AND position(lower(coalesce(p->>'query','')) IN lower(concat_ws(' ',n.data->>'title',n.data->>'body',n.data->>'place',n.data->>'tags'))) > 0
  ), page AS (
   SELECT * FROM filtered ORDER BY CASE WHEN p->>'sort'='oldest' THEN concat(data->>'date',data->>'time') END ASC,
    CASE WHEN coalesce(p->>'sort','newest')='newest' THEN concat(data->>'date',data->>'time') END DESC,id
   LIMIT coalesce((p->>'limit')::int,40) OFFSET coalesce((p->>'offset')::int,0)
  ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(app_private.workspace_memo_json(ROW(page.id,page.owner_id,page.data,page.version,page.created_at,page.updated_at)::app_private.workspace_memos,who)) FROM page),'[]'),
   'total',(SELECT count(*) FROM filtered),'hasAny',EXISTS(SELECT 1 FROM visible)) INTO result;
  RETURN result;
 END IF;
 IF op='workspace.memos.photo' THEN
  SELECT * INTO photo FROM app_private.workspace_memo_photos WHERE id=(p->>'id')::uuid;
  SELECT * INTO m FROM app_private.workspace_memos WHERE id=photo.memo_id;
  IF m.id IS NULL OR NOT (m.owner_id=who OR m.data->>'visibility'='GROUP' AND app_private.workspace_can_read(who,m.owner_id)) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN jsonb_build_object('data',replace(encode(photo.bytes,'base64'),E'\n',''),'mime','image/jpeg');
 END IF;
 target_id:=(p->>'id')::uuid;
 -- Serialize owner writes, including quota and create retries, on this account only.
 PERFORM 1 FROM app_private.workspace_profiles WHERE workspace_profiles.id=who FOR UPDATE;
 SELECT * INTO m FROM app_private.workspace_memos WHERE workspace_memos.id=target_id FOR UPDATE;
 IF op='workspace.memos.favorite' THEN
  IF m.id IS NULL OR NOT (m.owner_id=who OR m.data->>'visibility'='GROUP' AND app_private.workspace_can_read(who,m.owner_id)) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF jsonb_typeof(p->'favorite')<>'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF (p->>'favorite')::boolean THEN INSERT INTO app_private.workspace_memo_favorites VALUES(who,target_id) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM app_private.workspace_memo_favorites WHERE profile_id=who AND memo_id=target_id; END IF;
  RETURN jsonb_build_object('favorite',(p->>'favorite')::boolean);
 END IF;
 IF op NOT IN ('workspace.memos.save','workspace.memos.delete') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF m.id IS NOT NULL AND m.owner_id<>who THEN RAISE EXCEPTION 'AUTHOR_ONLY'; END IF;
 expected:=(p->>'version')::int;
 IF expected IS NULL OR expected<0 OR coalesce(m.version,0)<>expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF op='workspace.memos.delete' THEN
  IF m.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  DELETE FROM app_private.workspace_memos WHERE workspace_memos.id=target_id;
  RETURN '{}';
 END IF;
 IF identity->>'role'='PARENT' THEN
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT publication.id INTO required_publication FROM app_private.legal_publications publication ORDER BY version DESC LIMIT 1;
  IF required_publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances a WHERE a.member_id=app_private.actor() AND a.publication_id=required_publication AND a.withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
 END IF;
 fields:=jsonb_build_object('title',p->>'title','body',p->>'body','date',p->>'date','time',p->>'time','category',p->>'category','tags',p->'tags','place',p->>'place','location',p->'location','visibility',p->>'visibility');
 IF NOT fields ?& ARRAY['title','body','date','time','category','tags','place','location','visibility']
  OR char_length(coalesce(p->>'title','')) NOT BETWEEN 1 AND 100 OR char_length(p->>'body')>10000
  OR (p->>'date')::date NOT BETWEEN date '1900-01-01' AND date '2099-12-31'
  OR p->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR jsonb_typeof(p->'tags')<>'array' OR jsonb_array_length(p->'tags')>5
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'tags') tag WHERE jsonb_typeof(tag)<>'string' OR char_length(tag#>>'{}') NOT BETWEEN 1 AND 24)
  OR char_length(p->>'place')>120 OR jsonb_typeof(p->'photos')<>'array' OR jsonb_array_length(p->'photos')>3
  OR (p->'location'<>'null'::jsonb AND (jsonb_typeof(p->'location')<>'object' OR NOT p->'location' ?& ARRAY['latitude','longitude','accuracy','capturedAt']
    OR (p->'location'->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR (p->'location'->>'longitude')::numeric NOT BETWEEN -180 AND 180))
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF m.id IS NULL THEN INSERT INTO app_private.workspace_memos(id,owner_id,data) VALUES(target_id,who,fields);
 ELSE UPDATE app_private.workspace_memos SET data=fields,version=version+1,updated_at=now() WHERE workspace_memos.id=target_id; END IF;
 FOR part IN SELECT * FROM jsonb_array_elements(p->'photos') LOOP
  IF part?'id' THEN
   photo_id:=(part->>'id')::uuid;
   IF photo_id=ANY(kept) OR NOT EXISTS(SELECT 1 FROM app_private.workspace_memo_photos WHERE workspace_memo_photos.id=photo_id AND memo_id=target_id) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.workspace_memo_photos SET position=pos WHERE workspace_memo_photos.id=photo_id;
  ELSE
   bytes:=decode(part->>'data','base64');
   IF octet_length(bytes) NOT BETWEEN 4 AND 350000 OR substring(bytes from 1 for 2)<>decode('ffd8','hex') OR substring(bytes from octet_length(bytes)-1 for 2)<>decode('ffd9','hex') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   INSERT INTO app_private.workspace_memo_photos(memo_id,bytes,width,height,position) VALUES(target_id,bytes,(part->>'width')::int,(part->>'height')::int,pos) RETURNING workspace_memo_photos.id INTO photo_id;
  END IF;
  kept:=array_append(kept,photo_id);pos:=pos+1;
 END LOOP;
 DELETE FROM app_private.workspace_memo_photos WHERE memo_id=target_id AND NOT workspace_memo_photos.id=ANY(kept);
 IF (SELECT coalesce(sum(octet_length(ph.bytes)),0) FROM app_private.workspace_memo_photos ph JOIN app_private.workspace_memos n ON n.id=ph.memo_id WHERE n.owner_id=who)>262144000 THEN RAISE EXCEPTION 'PHOTO_LIMIT'; END IF;
 SELECT * INTO m FROM app_private.workspace_memos WHERE workspace_memos.id=target_id;
 RETURN app_private.workspace_memo_json(m,who);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_memo_json(app_private.workspace_memos,uuid),app_private.workspace_memo_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_memo_command(text,jsonb) TO app_runtime;
-- Preserve authored annotation text once, as private independent entries. Do not copy schedules.
-- The legacy timeline migration has an older, future-dated filename; fresh installs have no annotations yet.
DO $$ BEGIN
 IF to_regclass('app_private.workspace_timeline_annotations') IS NOT NULL THEN
  INSERT INTO app_private.workspace_memos(id,owner_id,data)
  SELECT gen_random_uuid(),a.profile_id,jsonb_build_object('title',left(i.data->>'title',100),'body',a.note,
   'date',coalesce(nullif(a.occurrence_date,'-infinity'::date),(i.data->>'date')::date)::text,'time',coalesce(nullif(i.data->>'startTime',''),'09:00'),
   'category','OTHER','tags',jsonb_build_array('이전 메모'),'place','','location',NULL,'visibility','PRIVATE')
  FROM app_private.workspace_timeline_annotations a JOIN app_private.workspace_items i ON i.id=a.item_id WHERE a.note<>'';
 END IF;
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

-- New accounts start at schedule time; existing choices remain unchanged.
ALTER TABLE app_private.workspace_push_preferences ALTER COLUMN reminder_minutes SET DEFAULT 0;
ALTER TABLE app_private.workspace_push_preferences ALTER COLUMN calendar_changes SET DEFAULT false;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.workspace_push_valid(q app_private.workspace_push_outbox,s app_private.workspace_push_subscriptions) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.workspace_push_session(s) AND q.expires_at>now() AND (q.reason='test' OR EXISTS(
 SELECT 1 FROM app_private.workspace_items i JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id
 WHERE i.id=q.item_id AND i.version=q.item_version AND app_private.workspace_can_read(s.profile_id,i.owner_id)
 AND (i.chat_room_id IS NULL OR app_private.workspace_room_member(s.profile_id,i.chat_room_id))
 AND (q.reason='calendar-change' OR i.deleted_at IS NULL)
 AND CASE q.reason WHEN 'chat' THEN i.kind='CHAT' AND p.chat WHEN 'calendar-change' THEN i.kind='EVENT' AND p.calendar_changes WHEN 'calendar-reminder' THEN i.kind IN ('EVENT','REPEAT') AND p.calendar_reminders ELSE false END
 AND (i.owner_id=s.profile_id OR EXISTS(SELECT 1 FROM app_private.workspace_links r JOIN app_private.workspace_links a ON a.family_id=r.family_id AND a.profile_id=i.owner_id AND a.active AND a.version=q.author_link WHERE r.profile_id=s.profile_id AND r.active AND r.family_id=q.family_id AND r.version=q.recipient_link))
 AND (q.reason NOT IN ('chat','calendar-change') OR q.menu_revision=0 OR NOT EXISTS(SELECT 1 FROM app_private.workspace_menu_updates u WHERE u.profile_id=s.profile_id AND u.menu=CASE q.reason WHEN 'chat' THEN 'chat' ELSE 'calendar' END AND u.seen_revision>=q.menu_revision))
 ))
$$;
CREATE OR REPLACE FUNCTION app_private.workspace_push_worker(secret text,op text,p jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; job_row app_private.workspace_push_outbox; device_row app_private.workspace_push_subscriptions; pref app_private.workspace_push_preferences; item app_private.workspace_items; n integer;
BEGIN
 IF length(secret)<32 OR NOT EXISTS(SELECT 1 FROM app_private.workspace_push_config WHERE singleton AND secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF op='plan' THEN
  -- Compute just-due occurrences in Asia/Seoul. Month-end and leap-day clamp identically to the calendar.
  INSERT INTO app_private.workspace_push_outbox(subscription_id,item_id,item_version,reason,dedupe_key,due_at,expires_at,family_id,recipient_link,author_link)
  SELECT s.id,i.id,i.version,'calendar-reminder','reminder:'||i.id||':'||d.day||':'||p.reminder_minutes,t.due,t.due+interval '15 minutes',r.family_id,r.version,a.version
  FROM app_private.workspace_push_subscriptions s JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id AND p.calendar_reminders
  JOIN app_private.workspace_items i ON i.kind IN ('EVENT','REPEAT') AND i.deleted_at IS NULL AND app_private.workspace_can_read(s.profile_id,i.owner_id)
  LEFT JOIN app_private.workspace_links r ON r.profile_id=s.profile_id AND r.active
  LEFT JOIN app_private.workspace_links a ON a.profile_id=i.owner_id AND a.family_id=r.family_id AND a.active
  CROSS JOIN LATERAL (SELECT ((now()+make_interval(mins=>p.reminder_minutes)) AT TIME ZONE 'Asia/Seoul')::date + z AS day FROM generate_series(-1,0) z) d
  CROSS JOIN LATERAL (SELECT (d.day+CASE WHEN coalesce((i.data->>'allDay')::boolean,false) THEN time '09:00' ELSE coalesce(nullif(i.data->>'startTime','')::time,time '09:00') END) AT TIME ZONE 'Asia/Seoul'-make_interval(mins=>p.reminder_minutes) AS due) t
  WHERE app_private.workspace_push_session(s) AND t.due<=now() AND t.due>now()-interval '15 minutes' AND t.due>=s.created_at
  AND CASE WHEN i.kind='EVENT' THEN app_private.workspace_push_occurs(i.data,d.day) ELSE i.data->'weekdays' @> to_jsonb(ARRAY[extract(dow FROM d.day)::int]) END
  ON CONFLICT(subscription_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  DELETE FROM app_private.workspace_push_outbox WHERE created_at<now()-interval '7 days';
  DELETE FROM app_private.workspace_push_subscriptions WHERE NOT enabled AND updated_at<now()-interval '30 days';
  RETURN jsonb_build_object('planned',n);
 ELSIF op='claim' THEN
  UPDATE app_private.workspace_push_outbox SET state='failed',finished_at=now() WHERE state='leased' AND attempts>=5 AND lease_until<now();
  UPDATE app_private.workspace_push_outbox q SET state='cancelled',finished_at=now() FROM app_private.workspace_push_subscriptions s WHERE s.id=q.subscription_id AND q.state IN ('pending','leased') AND NOT app_private.workspace_push_valid(q,s);
  WITH candidates AS (SELECT id FROM app_private.workspace_push_outbox WHERE due_at<=now() AND expires_at>now() AND attempts<5 AND (state='pending' OR (state='leased' AND lease_until<now())) ORDER BY due_at,id LIMIT least(greatest(coalesce((p->>'limit')::int,20),1),50) FOR UPDATE SKIP LOCKED),
  leased AS (UPDATE app_private.workspace_push_outbox SET state='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' WHERE id IN(SELECT id FROM candidates) RETURNING id,lease_token,due_at)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'leaseToken',lease_token) ORDER BY due_at,id),'[]') INTO result FROM leased;
  RETURN result;
 ELSIF op='delivery' THEN
  SELECT * INTO job_row FROM app_private.workspace_push_outbox WHERE id=(p->>'id')::uuid AND lease_token=(p->>'leaseToken')::uuid AND state='leased' AND lease_until>now();
  IF NOT FOUND THEN RETURN 'null'; END IF;
  SELECT * INTO device_row FROM app_private.workspace_push_subscriptions WHERE id=job_row.subscription_id;
  IF NOT app_private.workspace_push_valid(job_row,device_row) THEN UPDATE app_private.workspace_push_outbox SET state='cancelled',finished_at=now() WHERE id=job_row.id;RETURN 'null'; END IF;
  SELECT * INTO pref FROM app_private.workspace_push_preferences WHERE profile_id=device_row.profile_id;
  SELECT * INTO item FROM app_private.workspace_items WHERE id=job_row.item_id;
  RETURN jsonb_build_object('subscription',jsonb_build_object('endpoint',device_row.endpoint,'keys',jsonb_build_object('p256dh',device_row.p256dh,'auth',device_row.auth)),
   'payload',jsonb_build_object('title',CASE job_row.reason WHEN 'chat' THEN '아이하루 · 새 대화' WHEN 'calendar-reminder' THEN '아이하루 · 일정 알림' WHEN 'calendar-change' THEN '아이하루 · 달력 업데이트' ELSE '아이하루 · 알림 연결 완료' END,
   'body',CASE WHEN pref.preview AND item.deleted_at IS NULL AND item.id IS NOT NULL THEN left(CASE WHEN job_row.reason='chat' THEN item.data->>'note' ELSE item.data->>'title' END,100) ELSE CASE job_row.reason WHEN 'chat' THEN '가족이 보낸 새 대화를 확인해 주세요.' WHEN 'calendar-reminder' THEN '예정된 시간표·달력 일정을 확인해 주세요.' WHEN 'calendar-change' THEN '가족 달력의 일정이 변경되었어요.' ELSE '이 기기에서 시간표·달력·대화 알림을 받을 수 있어요.' END END,
   'url',CASE WHEN job_row.reason='chat' THEN '/chat' WHEN job_row.reason='test' THEN '/notification-settings' WHEN item.kind='REPEAT' THEN '/timetable' ELSE '/today/calendar' END,
   'tag',CASE WHEN job_row.reason='chat' THEN 'iharu-chat' ELSE 'iharu-'||job_row.id END,'profileId',device_row.profile_id,'expiresAt',job_row.expires_at),
   'ttl',greatest(1,extract(epoch FROM(job_row.expires_at-now()))::int));
 ELSIF op='complete' THEN
  SELECT * INTO job_row FROM app_private.workspace_push_outbox WHERE id=(p->>'id')::uuid AND lease_token=(p->>'leaseToken')::uuid AND state='leased' FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  n:=(p->>'status')::int;
  IF n IN(404,410) THEN UPDATE app_private.workspace_push_subscriptions SET enabled=false,updated_at=now() WHERE id=job_row.subscription_id; END IF;
  UPDATE app_private.workspace_push_outbox SET last_status=n,lease_until=NULL,
   state=CASE WHEN n BETWEEN 200 AND 299 THEN 'sent' WHEN n IN(404,410) OR job_row.attempts>=5 OR (n BETWEEN 400 AND 499 AND n<>429) THEN 'failed' ELSE 'pending' END,
   due_at=CASE WHEN n=429 THEN greatest(now()+interval '1 minute',now()+make_interval(secs=>least(greatest(coalesce((p->>'retryAfter')::int,60),60),900))) ELSE now()+make_interval(secs=>least(600,15*(2^job_row.attempts)::int)) END,
   finished_at=CASE WHEN n BETWEEN 200 AND 299 OR n IN(404,410) OR job_row.attempts>=5 OR (n BETWEEN 400 AND 499 AND n<>429) THEN now() END WHERE id=job_row.id;
  RETURN '{}';
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
