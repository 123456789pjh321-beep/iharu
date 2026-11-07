-- P05: daily records. Additive; the security/deletion outbox is intentionally unchanged.
CREATE TABLE app.checkins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid NOT NULL,child_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('ARRIVED','DEPARTED')),occurrence_id uuid,
 happened_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 actor_type text NOT NULL CHECK(actor_type IN ('GUARDIAN','CHILD')),principal_id uuid NOT NULL,
 client_event_id uuid NOT NULL,request_payload jsonb NOT NULL,created_by uuid,updated_by uuid,
 supersedes_id uuid UNIQUE REFERENCES app.checkins(id) ON DELETE SET NULL,
 voided_at timestamptz,reason text CHECK(length(reason) BETWEEN 1 AND 300),version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(principal_id,client_event_id),UNIQUE(family_id,child_id,id),
 FOREIGN KEY(family_id,child_id) REFERENCES app.children(family_id,id),
 FOREIGN KEY(family_id,child_id,occurrence_id) REFERENCES app.occurrences(family_id,child_id,id)
);
CREATE TABLE app.tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid NOT NULL,child_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),detail text NOT NULL DEFAULT '' CHECK(length(detail)<=1000),
 due_at timestamptz,assignee_member_id uuid,source_name text NOT NULL DEFAULT '' CHECK(length(source_name)<=80),
 source_url text CHECK(length(source_url)<=2000 AND source_url ~ '^https://[^[:space:]]+$'),
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','DONE','CANCELLED')),
 created_by uuid NOT NULL,updated_by uuid,updated_principal_id uuid NOT NULL,closed_at timestamptz,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_id,child_id,id),FOREIGN KEY(family_id,child_id) REFERENCES app.children(family_id,id),
 FOREIGN KEY(family_id,assignee_member_id) REFERENCES app.memberships(family_id,member_id)
);
CREATE TABLE app.learning_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid NOT NULL,child_id uuid NOT NULL,
 learning_date date NOT NULL,subject text NOT NULL DEFAULT '' CHECK(length(subject)<=30),content text NOT NULL,task_id uuid,
 created_by uuid NOT NULL,updated_by uuid NOT NULL,deleted_at timestamptz,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_id,child_id,id),FOREIGN KEY(family_id,child_id) REFERENCES app.children(family_id,id),
 FOREIGN KEY(family_id,child_id,task_id) REFERENCES app.tasks(family_id,child_id,id),
 CHECK(length(content) BETWEEN 1 AND 1000 OR deleted_at IS NOT NULL AND content='')
);
CREATE TABLE app.pickups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid NOT NULL,child_id uuid NOT NULL,occurrence_id uuid,
 assignee_member_id uuid,scheduled_at timestamptz NOT NULL,place text NOT NULL DEFAULT '' CHECK(length(place)<=100),memo text NOT NULL DEFAULT '' CHECK(length(memo)<=500),
 state text NOT NULL DEFAULT 'PROPOSED' CHECK(state IN ('PROPOSED','ACCEPTED','HANDED_OVER','CANCELLED')),
 created_by uuid NOT NULL,updated_by uuid,closed_at timestamptz,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_id,child_id,id),FOREIGN KEY(family_id,child_id) REFERENCES app.children(family_id,id),
 FOREIGN KEY(family_id,child_id,occurrence_id) REFERENCES app.occurrences(family_id,child_id,id),
 FOREIGN KEY(family_id,assignee_member_id) REFERENCES app.memberships(family_id,member_id),
 CHECK(state<>'ACCEPTED' OR assignee_member_id IS NOT NULL)
);
CREATE UNIQUE INDEX one_active_pickup ON app.pickups(occurrence_id) WHERE occurrence_id IS NOT NULL AND state IN ('PROPOSED','ACCEPTED');
CREATE INDEX checkin_child_time ON app.checkins(child_id,happened_at,id);
CREATE INDEX checkin_occurrence ON app.checkins(occurrence_id,kind) WHERE voided_at IS NULL;
CREATE INDEX task_child_due ON app.tasks(child_id,state,due_at,id);
CREATE INDEX learning_child_date ON app.learning_entries(child_id,learning_date,id);
CREATE INDEX learning_task ON app.learning_entries(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX pickup_child_time ON app.pickups(child_id,scheduled_at,id);
CREATE INDEX pickup_assignee ON app.pickups(family_id,assignee_member_id) WHERE state IN ('PROPOSED','ACCEPTED');
CREATE TABLE app_private.daily_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES app.children(id),target_id uuid NOT NULL,
 resource_type text NOT NULL,kind text NOT NULL,resource_version integer NOT NULL,actor_id uuid,reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(target_id,resource_version)
);
CREATE TABLE app_private.daily_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES app.children(id),target_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('TASK_DUE','MISSING_ARRIVAL','PICKUP_CHANGED')),resource_version integer NOT NULL,
 available_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CANCELLED','DONE')),
 finished_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(target_id,kind,resource_version)
);
CREATE INDEX daily_jobs_pending ON app_private.daily_jobs(available_at,id) WHERE state='PENDING';
CREATE INDEX daily_events_child ON app_private.daily_events(child_id,created_at,id);
CREATE TABLE app_private.daily_idempotency (
 principal_id uuid NOT NULL,key text NOT NULL,operation text NOT NULL,payload jsonb NOT NULL,response jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(principal_id,key)
);
CREATE INDEX daily_idempotency_expiry ON app_private.daily_idempotency(expires_at);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['checkins','tasks','learning_entries','pickups'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY policy_executor ON app.%I TO iharu_policy USING(true) WITH CHECK(true)',tab);
  EXECUTE format('CREATE POLICY guardian_daily_read ON app.%I FOR SELECT TO app_runtime USING(app_private.member_of(family_id) AND app_private.child_allowed(child_id,''daily''))',tab);
  EXECUTE format('GRANT SELECT ON app.%I TO app_runtime',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app.%I TO iharu_policy',tab);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',tab);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.daily_events,app_private.daily_jobs,app_private.daily_idempotency TO iharu_policy;
REVOKE ALL ON app_private.daily_events,app_private.daily_jobs,app_private.daily_idempotency FROM PUBLIC,app_runtime,worker_runtime;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;

CREATE FUNCTION app_private.daily_member_name(mid uuid) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce((SELECT u.name FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE m.id=mid),'아이 기기')
$$;
CREATE FUNCTION app_private.daily_assignee(cid uuid,mid uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT mid IS NOT NULL AND EXISTS(SELECT 1 FROM app.child_grants g JOIN app.memberships m ON m.family_id=g.family_id AND m.member_id=g.member_id
 WHERE g.child_id=cid AND g.member_id=mid AND g.daily AND m.status='ACTIVE')
$$;
CREATE FUNCTION app_private.daily_dto(kind text,rid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE c app.checkins%ROWTYPE;t app.tasks%ROWTYPE;l app.learning_entries%ROWTYPE;p app.pickups%ROWTYPE;
 cid uuid;created timestamptz;updated timestamptz;at_time timestamptz;author uuid;editor uuid;v integer;fields jsonb;actions jsonb:='[]';
 actor uuid:=app_private.actor();guardian boolean:=app_private.guardian_ready();manager boolean;
BEGIN
 IF kind='CHECKIN' THEN
  SELECT * INTO c FROM app.checkins WHERE id=rid;IF NOT FOUND THEN RETURN NULL;END IF;
  cid:=c.child_id;created:=c.created_at;updated:=c.updated_at;at_time:=c.happened_at;author:=c.created_by;editor:=c.updated_by;v:=c.version;
  fields:=jsonb_build_object('kind',c.kind,'occurrenceId',c.occurrence_id,'occurrenceTitle',(SELECT title FROM app.occurrences WHERE id=c.occurrence_id),'happenedAt',c.happened_at,'receivedAt',c.received_at,'actorType',c.actor_type,'supersedesId',c.supersedes_id,'voidedAt',c.voided_at,'reason',c.reason);
 ELSIF kind='TASK' THEN
  SELECT * INTO t FROM app.tasks WHERE id=rid;IF NOT FOUND THEN RETURN NULL;END IF;
  cid:=t.child_id;created:=t.created_at;updated:=t.updated_at;at_time:=coalesce(t.closed_at,t.created_at);author:=t.created_by;editor:=t.updated_by;v:=t.version;
  fields:=jsonb_build_object('title',t.title,'detail',t.detail,'state',t.state,'dueAt',t.due_at,'assigneeMemberId',t.assignee_member_id,'sourceName',t.source_name,'sourceUrl',t.source_url,'closedAt',t.closed_at);
 ELSIF kind='LEARNING' THEN
  IF NOT guardian THEN RETURN NULL;END IF;
  SELECT * INTO l FROM app.learning_entries WHERE id=rid AND deleted_at IS NULL;IF NOT FOUND THEN RETURN NULL;END IF;
  cid:=l.child_id;created:=l.created_at;updated:=l.updated_at;at_time:=l.learning_date::timestamp AT TIME ZONE 'Asia/Seoul';author:=l.created_by;editor:=l.updated_by;v:=l.version;
  fields:=jsonb_build_object('learningDate',l.learning_date,'subject',l.subject,'content',l.content,'taskId',l.task_id,'taskTitle',(SELECT title FROM app.tasks WHERE id=l.task_id AND state<>'CANCELLED' AND app_private.child_allowed(child_id,'daily')));
 ELSIF kind='PICKUP' THEN
  SELECT * INTO p FROM app.pickups WHERE id=rid;IF NOT FOUND THEN RETURN NULL;END IF;
  cid:=p.child_id;created:=p.created_at;updated:=p.updated_at;at_time:=p.scheduled_at;author:=p.created_by;editor:=p.updated_by;v:=p.version;
  fields:=jsonb_build_object('state',p.state,'scheduledAt',p.scheduled_at,'assigneeMemberId',p.assignee_member_id,'assigneeName',CASE WHEN p.assignee_member_id IS NOT NULL THEN app_private.daily_member_name(p.assignee_member_id) END);
  IF guardian THEN fields:=fields||jsonb_build_object('place',p.place,'memo',p.memo,'occurrenceId',p.occurrence_id,'occurrenceTitle',(SELECT title FROM app.occurrences WHERE id=p.occurrence_id),'closedAt',p.closed_at,
   'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.kind,'at',e.created_at,'actorName',CASE WHEN e.actor_id IS NULL THEN '공유 권한 변경' ELSE app_private.daily_member_name(e.actor_id) END,'reason',e.reason) ORDER BY e.resource_version),'[]') FROM app_private.daily_events e WHERE e.target_id=rid));END IF;
 ELSE RETURN NULL;END IF;
 IF NOT app_private.child_allowed(cid,'daily') THEN RETURN NULL;END IF;
 manager:=guardian AND (author=actor OR EXISTS(SELECT 1 FROM app.children WHERE id=cid AND consenter_id=actor));
 IF kind='CHECKIN' AND manager AND c.voided_at IS NULL THEN actions:='["CORRECT"]';
 ELSIF kind='TASK' THEN
  IF t.state='OPEN' THEN actions:='["COMPLETE"]';END IF;
  IF guardian AND t.state='DONE' THEN actions:='["REOPEN"]';END IF;
  IF guardian AND t.state<>'CANCELLED' THEN actions:=actions||'["EDIT"]'::jsonb;END IF;
  IF manager AND t.state<>'CANCELLED' THEN actions:=actions||'["CANCEL"]'::jsonb;END IF;
 ELSIF kind='LEARNING' AND manager THEN actions:='["EDIT","DELETE"]';
 ELSIF kind='PICKUP' AND guardian THEN
  IF p.state='PROPOSED' AND p.assignee_member_id=actor AND app_private.daily_assignee(cid,actor) THEN actions:=actions||'["ACCEPT"]'::jsonb;END IF;
  IF p.state='ACCEPTED' AND (p.assignee_member_id=actor OR EXISTS(SELECT 1 FROM app.children WHERE id=cid AND consenter_id=actor)) THEN actions:=actions||'["HANDOVER"]'::jsonb;END IF;
  IF manager AND p.state IN ('PROPOSED','ACCEPTED') THEN actions:=actions||'["REASSIGN","CANCEL"]'::jsonb;END IF;
  IF manager AND p.state='HANDED_OVER' THEN actions:=actions||'["ANNOTATE"]'::jsonb;END IF;
 END IF;
 RETURN jsonb_build_object('id',rid,'type',kind,'childId',cid,'childName',(SELECT nickname FROM app.children WHERE id=cid),'version',v,'recordAt',at_time,'createdAt',created,'updatedAt',updated,
 'authorName',CASE WHEN kind='PICKUP' AND NOT guardian THEN '' ELSE app_private.daily_member_name(author) END,'editorName',CASE WHEN kind='PICKUP' AND NOT guardian THEN '' ELSE app_private.daily_member_name(editor) END,'actions',actions)||fields;
END $$;

CREATE FUNCTION app_private.daily_event(cid uuid,target uuid,resource text,event_kind text,v integer,actor uuid,reason_value text DEFAULT '') RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 INSERT INTO app_private.daily_events(child_id,target_id,resource_type,kind,resource_version,actor_id,reason) VALUES(cid,target,resource,event_kind,v,actor,coalesce(reason_value,''));
 UPDATE app_private.daily_jobs SET state='CANCELLED',finished_at=now() WHERE target_id=target AND state='PENDING';
 IF resource='TASK' THEN
  INSERT INTO app_private.daily_jobs(child_id,target_id,kind,resource_version,available_at)
  SELECT cid,target,'TASK_DUE',v,due_at-interval '30 minutes' FROM app.tasks WHERE id=target AND state='OPEN' AND due_at>now()+interval '30 minutes' ON CONFLICT DO NOTHING;
 ELSIF resource='PICKUP' THEN
  INSERT INTO app_private.daily_jobs(child_id,target_id,kind,resource_version,available_at) VALUES(cid,target,'PICKUP_CHANGED',v,now()) ON CONFLICT DO NOTHING;
 END IF;
END $$;

CREATE FUNCTION app_private.daily_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor();principal uuid;guardian boolean:=app_private.guardian_ready();cid uuid;fid uuid;target uuid;oid uuid;sid uuid;consenter uuid;
 today date:=(now() AT TIME ZONE 'Asia/Seoul')::date;day date;lo date;hi date;n integer;items jsonb;result jsonb;response_value jsonb;meta jsonb;
 resource text:=upper(split_part(op,'.',1));read_only boolean:=op IN ('today','child.today','members','records') OR op LIKE '%.get' OR op LIKE '%.list';
 c app.checkins%ROWTYPE;t app.tasks%ROWTYPE;l app.learning_entries%ROWTYPE;k app.pickups%ROWTYPE;oc app.occurrences%ROWTYPE;idem app_private.daily_idempotency%ROWTYPE;
 input jsonb;at_time timestamptz;key_value text;kind_value text;next_cursor uuid;record_ids uuid[];record_kinds text[];actor_kind text;actions jsonb;
BEGIN
 IF guardian THEN principal:=actor;actor_kind:='GUARDIAN';
 ELSE
  SELECT id,child_id INTO principal,cid FROM app.child_devices WHERE token_hash=nullif(current_setting('iharu.device_hash',true),'') AND status='ACTIVE' AND expires_at>now() AND last_seen_at>now()-interval '7 days';
  IF principal IS NULL THEN RAISE EXCEPTION 'ACCESS_NOT_READY';END IF;
  actor:=NULL;actor_kind:='CHILD';
  IF NOT (op IN ('child.today','checkin.create','checkin.get','task.list','task.get','task.action','pickup.list','pickup.get')) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
  IF op='task.action' AND p->>'action'<>'COMPLETE' THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 END IF;
 cid:=NULL;
 IF p ? 'id' THEN
  target:=(p->>'id')::uuid;
  IF resource='CHECKIN' THEN SELECT child_id,family_id INTO cid,fid FROM app.checkins WHERE id=target;
  ELSIF resource='TASK' THEN SELECT child_id,family_id INTO cid,fid FROM app.tasks WHERE id=target;
  ELSIF resource='LEARNING' THEN SELECT child_id,family_id INTO cid,fid FROM app.learning_entries WHERE id=target;
  ELSIF resource='PICKUP' THEN SELECT child_id,family_id INTO cid,fid FROM app.pickups WHERE id=target;END IF;
 ELSE
  cid:=(p->>'childId')::uuid;fid:=(p->>'familyId')::uuid;
  IF cid IS NOT NULL THEN
   SELECT family_id INTO fid FROM app.children WHERE id=cid AND (fid IS NULL OR family_id=fid);
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
 END IF;
 IF op='today' THEN IF NOT app_private.member_of(fid) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSIF cid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF cid IS NOT NULL AND NOT app_private.child_allowed(cid,'daily') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 meta:=jsonb_build_object('requestId',current_setting('iharu.request_id',true),'serverNow',now());
 IF op='members' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.member_id,'name',app_private.daily_member_name(g.member_id)) ORDER BY g.member_id),'[]') INTO items FROM app.child_grants g
  WHERE g.child_id=cid AND app_private.daily_assignee(cid,g.member_id);
  RETURN jsonb_build_object('data',jsonb_build_object('members',items),'meta',meta);
 END IF;
 IF op IN ('today','child.today') THEN
  day:=coalesce((p->>'date')::date,today);IF day<today-89 OR day>today+55 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
  -- Expands through the existing schedule service, preserving holiday/manual decisions.
  FOR sid IN SELECT id FROM app.schedule_series WHERE family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND last_date>=today ORDER BY id LOOP PERFORM app_private.expand_schedule(sid);END LOOP;
  SELECT coalesce(jsonb_agg(app_private.occurrence_dto(x) ORDER BY x.starts_at,x.id),'[]') INTO items FROM
   (SELECT * FROM app.occurrences WHERE family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND actual_date=day ORDER BY starts_at,id LIMIT 101) x;
  result:=jsonb_build_object('date',day,'serverToday',today,'occurrences',items,'truncated',jsonb_array_length(items)>100);
  SELECT coalesce(jsonb_agg(app_private.daily_dto('CHECKIN',x.id) ORDER BY x.happened_at,x.id),'[]') INTO items FROM
   (SELECT * FROM app.checkins WHERE family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND (happened_at AT TIME ZONE 'Asia/Seoul')::date=day ORDER BY happened_at,id LIMIT 101) x;
  result:=result||jsonb_build_object('checkins',items,'truncated',(result->>'truncated')::boolean OR jsonb_array_length(items)>100);
  SELECT coalesce(jsonb_agg(app_private.daily_dto('TASK',x.id) ORDER BY x.due_at NULLS LAST,x.id),'[]') INTO items FROM
   (SELECT * FROM app.tasks WHERE family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND
   (state='OPEN' AND (due_at IS NULL OR (due_at AT TIME ZONE 'Asia/Seoul')::date<=day) OR state='DONE' AND (closed_at AT TIME ZONE 'Asia/Seoul')::date=day) ORDER BY due_at NULLS LAST,id LIMIT 101) x;
  result:=result||jsonb_build_object('tasks',items,'truncated',(result->>'truncated')::boolean OR jsonb_array_length(items)>100);
  SELECT coalesce(jsonb_agg(app_private.daily_dto('PICKUP',x.id) ORDER BY x.scheduled_at,x.id),'[]') INTO items FROM
   (SELECT * FROM app.pickups WHERE family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND (scheduled_at AT TIME ZONE 'Asia/Seoul')::date=day ORDER BY scheduled_at,id LIMIT 101) x;
  result:=result||jsonb_build_object('pickups',items,'truncated',(result->>'truncated')::boolean OR jsonb_array_length(items)>100);
  SELECT coalesce(jsonb_agg(app_private.daily_dto('LEARNING',x.id) ORDER BY x.updated_at DESC),'[]') INTO items FROM
   (SELECT * FROM app.learning_entries WHERE guardian AND family_id=fid AND (cid IS NULL OR child_id=cid) AND app_private.child_allowed(child_id,'daily') AND deleted_at IS NULL AND learning_date=day ORDER BY updated_at DESC,id LIMIT 10) x;
  RETURN jsonb_build_object('data',result||jsonb_build_object('recent',items),'meta',meta);
 ELSIF op LIKE '%.get' THEN
  result:=app_private.daily_dto(resource,target);IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN jsonb_build_object('data',result,'meta',meta);
 ELSIF op='records' OR op LIKE '%.list' THEN
  lo:=(p->>'from')::date;hi:=(p->>'to')::date;n:=least(coalesce((p->>'limit')::integer,30),50);
  IF lo IS NULL OR hi IS NULL OR lo<today-89 OR hi>today+55 OR hi<lo OR hi-lo>89 OR n<1 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
  kind_value:=CASE WHEN op='records' THEN coalesce(p->>'kind','ALL') ELSE resource END;
  -- Cursor is a resource UUID looked up only in this child's permitted result range.
  WITH rows AS (
   SELECT id,'CHECKIN' k,happened_at at FROM app.checkins WHERE child_id=cid AND kind_value IN ('ALL','CHECKIN')
   UNION ALL SELECT id,'TASK',coalesce(closed_at,created_at) FROM app.tasks WHERE child_id=cid AND kind_value IN ('ALL','TASK')
   UNION ALL SELECT id,'LEARNING',learning_date::timestamp AT TIME ZONE 'Asia/Seoul' FROM app.learning_entries WHERE child_id=cid AND guardian AND deleted_at IS NULL AND kind_value IN ('ALL','LEARNING')
   UNION ALL SELECT id,'PICKUP',scheduled_at FROM app.pickups WHERE child_id=cid AND kind_value IN ('ALL','PICKUP')
  ), scoped AS (SELECT * FROM rows WHERE (at AT TIME ZONE 'Asia/Seoul')::date BETWEEN lo AND hi)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind',x.k) ORDER BY x.at DESC,x.id DESC),'[]') INTO items FROM
   (SELECT * FROM scoped WHERE p->>'cursor' IS NULL OR (at,id)<(SELECT at,id FROM scoped WHERE id=(p->>'cursor')::uuid) ORDER BY at DESC,id DESC LIMIT n+1) x;
  IF jsonb_array_length(items)>n THEN items:=items-n;next_cursor:=(items->(n-1)->>'id')::uuid;END IF;
  SELECT coalesce(jsonb_agg(app_private.daily_dto(x->>'kind',(x->>'id')::uuid)),'[]') INTO result FROM jsonb_array_elements(items) x;
  RETURN jsonb_build_object('data',jsonb_build_object('items',result),'meta',meta||jsonb_build_object('nextCursor',next_cursor));
 END IF;
 IF read_only THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 -- Membership changes take the family lock; grant/consent changes take the child lock.
 PERFORM 1 FROM app.families WHERE id=fid FOR SHARE;
 SELECT consenter_id INTO consenter FROM app.children WHERE id=cid FOR UPDATE;
 IF NOT app_private.child_allowed(cid,'daily') OR guardian AND NOT app_private.guardian_ready() THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 key_value:=p->>'key';IF key_value IS NULL OR length(key_value) NOT BETWEEN 8 AND 128 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(principal::text||':'||key_value,55));
 DELETE FROM app_private.daily_idempotency WHERE principal_id=principal AND key=key_value AND expires_at<=now();
 SELECT * INTO idem FROM app_private.daily_idempotency WHERE principal_id=principal AND key=key_value;
 IF FOUND THEN IF idem.operation<>op OR idem.payload IS DISTINCT FROM p-'key' THEN RAISE EXCEPTION 'KEY_REUSED';END IF;RETURN idem.response;END IF;
 INSERT INTO app_private.daily_idempotency(principal_id,key,operation,payload) VALUES(principal,key_value,op,p-'key');
 IF op IN ('checkin.create','checkin.correct') THEN
  input:=CASE WHEN op='checkin.create' THEN p-'key' ELSE p->'replacement' END;
  IF op='checkin.correct' THEN
   SELECT * INTO c FROM app.checkins WHERE id=target FOR UPDATE;
   IF c.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   IF NOT guardian OR NOT coalesce(actor=c.created_by OR actor=consenter,false) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
   IF c.voided_at IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF coalesce(length(p->>'reason'),0) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  END IF;
  IF input IS NOT NULL AND input<>'null'::jsonb THEN
   -- Semantic replay survives the 24-hour HTTP idempotency window.
   IF op='checkin.create' THEN
    SELECT * INTO c FROM app.checkins WHERE principal_id=principal AND client_event_id=(input->>'clientEventId')::uuid;
    IF FOUND THEN IF c.request_payload IS DISTINCT FROM input THEN RAISE EXCEPTION 'KEY_REUSED';END IF;
     response_value:=jsonb_build_object('data',app_private.daily_dto('CHECKIN',c.id),'meta',meta);
     UPDATE app_private.daily_idempotency SET response=response_value WHERE principal_id=principal AND key=key_value;RETURN response_value;
    END IF;
   END IF;
   at_time:=(input->>'happenedAt')::timestamptz;oid:=(input->>'occurrenceId')::uuid;
   IF at_time IS NULL OR at_time>now()+interval '2 minutes' OR at_time<now()-interval '7 days' OR NOT guardian AND (at_time AT TIME ZONE 'Asia/Seoul')::date<>today THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   IF oid IS NOT NULL THEN
    SELECT series_id INTO sid FROM app.occurrences WHERE id=oid AND child_id=cid AND family_id=fid;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
    PERFORM 1 FROM app.schedule_series WHERE id=sid FOR UPDATE;
    SELECT * INTO oc FROM app.occurrences WHERE id=oid FOR UPDATE;
    IF oc.status IN ('CANCELLED','SKIPPED') OR oc.actual_date<>(at_time AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
    UPDATE app.occurrences SET protected_at=coalesce(protected_at,now()) WHERE id=oid;
   END IF;
   IF op='checkin.create' AND NOT coalesce((input->>'confirmRepeat')::boolean,false) AND EXISTS(SELECT 1 FROM app.checkins x WHERE x.child_id=cid AND x.kind=input->>'kind' AND x.occurrence_id IS NOT DISTINCT FROM oid AND x.voided_at IS NULL AND x.received_at>now()-interval '60 seconds') THEN RAISE EXCEPTION 'REPEAT_CONFIRM_REQUIRED';END IF;
   IF op='checkin.correct' THEN
    UPDATE app.checkins SET voided_at=now(),reason=p->>'reason',updated_by=actor,updated_at=now(),version=version+1 WHERE id=target;
    PERFORM app_private.daily_event(cid,target,'CHECKIN','CORRECTED',c.version+1,actor,p->>'reason');
   END IF;
   INSERT INTO app.checkins(family_id,child_id,kind,occurrence_id,happened_at,actor_type,principal_id,client_event_id,request_payload,created_by,updated_by,supersedes_id)
   VALUES(fid,cid,input->>'kind',oid,at_time,actor_kind,principal,(input->>'clientEventId')::uuid,input,actor,actor,CASE WHEN op='checkin.correct' THEN target END) RETURNING id INTO target;
   PERFORM app_private.daily_event(cid,target,'CHECKIN','RECORDED',1,actor);
   IF oid IS NOT NULL AND input->>'kind'='ARRIVED' THEN UPDATE app_private.daily_jobs SET state='CANCELLED',finished_at=now() WHERE target_id=oid AND kind='MISSING_ARRIVAL' AND state='PENDING';END IF;
  ELSE
   IF op<>'checkin.correct' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   UPDATE app.checkins SET voided_at=now(),reason=p->>'reason',updated_by=actor,updated_at=now(),version=version+1 WHERE id=target;
   PERFORM app_private.daily_event(cid,target,'CHECKIN','VOIDED',c.version+1,actor,p->>'reason');
  END IF;
 ELSIF resource='TASK' THEN
  IF op<>'task.create' THEN
   SELECT * INTO t FROM app.tasks WHERE id=target FOR UPDATE;
   IF t.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   IF t.state='CANCELLED' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  END IF;
  IF op IN ('task.create','task.edit') THEN
   IF NOT guardian THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
   IF p->>'assigneeMemberId' IS NOT NULL AND NOT app_private.daily_assignee(cid,(p->>'assigneeMemberId')::uuid) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE';END IF;
   IF op='task.create' THEN
    INSERT INTO app.tasks(family_id,child_id,title,detail,due_at,assignee_member_id,source_name,source_url,created_by,updated_by,updated_principal_id)
    VALUES(fid,cid,p->>'title',coalesce(p->>'detail',''),(p->>'dueAt')::timestamptz,(p->>'assigneeMemberId')::uuid,coalesce(p->>'sourceName',''),p->>'sourceUrl',actor,actor,principal) RETURNING * INTO t;target:=t.id;
   ELSE UPDATE app.tasks SET title=p->>'title',detail=coalesce(p->>'detail',''),due_at=(p->>'dueAt')::timestamptz,assignee_member_id=(p->>'assigneeMemberId')::uuid,source_name=coalesce(p->>'sourceName',''),source_url=p->>'sourceUrl',updated_by=actor,updated_principal_id=principal,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO t;END IF;
  ELSIF op='task.action' THEN
   IF p->>'action'='COMPLETE' AND t.state='OPEN' THEN kind_value:='DONE';
   ELSIF p->>'action'='REOPEN' AND guardian AND t.state='DONE' THEN kind_value:='OPEN';
   ELSIF p->>'action'='CANCEL' AND guardian AND (actor=t.created_by OR actor=consenter) THEN kind_value:='CANCELLED';
   ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE app.tasks SET state=kind_value,closed_at=CASE WHEN kind_value='OPEN' THEN NULL ELSE now() END,updated_by=actor,updated_principal_id=principal,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO t;
  ELSE RAISE EXCEPTION 'INVALID_INPUT';END IF;
  PERFORM app_private.daily_event(cid,target,'TASK',coalesce(p->>'action',upper(split_part(op,'.',2))),t.version,actor);
 ELSIF resource='LEARNING' THEN
  IF NOT guardian THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
  IF op<>'learning.create' THEN
   SELECT * INTO l FROM app.learning_entries WHERE id=target AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF l.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   IF NOT (actor=l.created_by OR actor=consenter) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
  END IF;
  IF op<>'learning.delete' THEN
   day:=(p->>'learningDate')::date;IF day<today-89 OR day>today THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
   IF p->>'taskId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.tasks WHERE id=(p->>'taskId')::uuid AND child_id=cid AND family_id=fid AND state<>'CANCELLED') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
  IF op='learning.create' THEN
   INSERT INTO app.learning_entries(family_id,child_id,learning_date,subject,content,task_id,created_by,updated_by) VALUES(fid,cid,day,coalesce(p->>'subject',''),p->>'content',(p->>'taskId')::uuid,actor,actor) RETURNING * INTO l;target:=l.id;
  ELSIF op='learning.edit' THEN UPDATE app.learning_entries SET learning_date=day,subject=coalesce(p->>'subject',''),content=p->>'content',task_id=(p->>'taskId')::uuid,updated_by=actor,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO l;
  ELSIF op='learning.delete' THEN UPDATE app.learning_entries SET deleted_at=now(),content='',subject='',task_id=NULL,updated_by=actor,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO l;
  ELSE RAISE EXCEPTION 'INVALID_INPUT';END IF;
  PERFORM app_private.daily_event(cid,target,'LEARNING',upper(split_part(op,'.',2)),l.version,actor);
 ELSIF resource='PICKUP' THEN
  IF NOT guardian THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
  IF op='pickup.create' THEN
   IF p->>'assigneeMemberId' IS NOT NULL AND NOT app_private.daily_assignee(cid,(p->>'assigneeMemberId')::uuid) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE';END IF;
   at_time:=(p->>'scheduledAt')::timestamptz;IF at_time<now()-interval '7 days' OR at_time>now()+interval '56 days' THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
   oid:=(p->>'occurrenceId')::uuid;
   IF oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.occurrences WHERE id=oid AND child_id=cid AND family_id=fid AND status NOT IN ('CANCELLED','SKIPPED')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   INSERT INTO app.pickups(family_id,child_id,occurrence_id,assignee_member_id,scheduled_at,place,memo,created_by,updated_by)
   VALUES(fid,cid,oid,(p->>'assigneeMemberId')::uuid,at_time,coalesce(p->>'place',''),coalesce(p->>'memo',''),actor,actor) RETURNING * INTO k;target:=k.id;
  ELSIF op='pickup.action' THEN
   SELECT * INTO k FROM app.pickups WHERE id=target FOR UPDATE;
   IF k.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   actions:=app_private.daily_dto('PICKUP',target)->'actions';IF NOT actions ? (p->>'action') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF p->>'action'='ACCEPT' THEN kind_value:='ACCEPTED';
   ELSIF p->>'action'='HANDOVER' THEN kind_value:='HANDED_OVER';
    IF NOT app_private.daily_assignee(cid,k.assignee_member_id) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE';END IF;
    IF k.occurrence_id IS NOT NULL THEN
     SELECT series_id INTO sid FROM app.occurrences WHERE id=k.occurrence_id;PERFORM 1 FROM app.schedule_series WHERE id=sid FOR UPDATE;
     UPDATE app.occurrences SET protected_at=coalesce(protected_at,now()) WHERE id=k.occurrence_id;
    END IF;
   ELSIF p->>'action'='REASSIGN' THEN kind_value:='PROPOSED';
    IF p->>'assigneeMemberId' IS NOT NULL AND NOT app_private.daily_assignee(cid,(p->>'assigneeMemberId')::uuid) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE';END IF;
    k.assignee_member_id:=(p->>'assigneeMemberId')::uuid;
   ELSIF p->>'action'='CANCEL' THEN kind_value:='CANCELLED';
   ELSE kind_value:=k.state;END IF;
   IF p->>'action' IN ('CANCEL','ANNOTATE') AND coalesce(length(p->>'reason'),0) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   UPDATE app.pickups SET state=kind_value,assignee_member_id=k.assignee_member_id,closed_at=CASE WHEN kind_value IN ('HANDED_OVER','CANCELLED') THEN coalesce(closed_at,now()) END,updated_by=actor,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO k;
  ELSE RAISE EXCEPTION 'INVALID_INPUT';END IF;
  PERFORM app_private.daily_event(cid,target,'PICKUP',coalesce(p->>'action','CREATE'),k.version,actor,p->>'reason');
 ELSE RAISE EXCEPTION 'INVALID_INPUT';END IF;
 result:=CASE WHEN op='learning.delete' THEN jsonb_build_object('id',target,'deleted',true,'version',l.version) ELSE app_private.daily_dto(resource,target) END;
 response_value:=jsonb_build_object('data',result,'meta',meta);
 UPDATE app_private.daily_idempotency SET response=response_value WHERE principal_id=principal AND key=key_value;
 RETURN response_value;
END $$;

-- Permission withdrawal invalidates unfinished pickup assignments in the same commit.
CREATE FUNCTION app_private.daily_grant_revoked() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p app.pickups%ROWTYPE;BEGIN
 IF OLD.daily AND NOT NEW.daily THEN
  FOR p IN UPDATE app.pickups SET assignee_member_id=NULL,state='PROPOSED',version=version+1,updated_at=now(),updated_by=NULL
   WHERE child_id=NEW.child_id AND assignee_member_id=NEW.member_id AND state IN ('PROPOSED','ACCEPTED') RETURNING * LOOP
   PERFORM app_private.daily_event(p.child_id,p.id,'PICKUP','ASSIGNEE_REVOKED',p.version,NULL,'담당자의 일정 공유가 종료되어 다시 지정해야 해요.');
  END LOOP;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER daily_grant_revoked AFTER UPDATE ON app.child_grants FOR EACH ROW EXECUTE FUNCTION app_private.daily_grant_revoked();

-- Creates durable, permission-rechecked reminder work for P07. This function sends nothing.
CREATE FUNCTION app_private.daily_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE total integer;BEGIN
 UPDATE app_private.daily_jobs j SET state='CANCELLED',finished_at=now() WHERE state='PENDING' AND (
  NOT EXISTS(SELECT 1 FROM app.children c JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL WHERE c.id=j.child_id AND c.status='ACTIVE') OR
  j.kind='TASK_DUE' AND NOT EXISTS(SELECT 1 FROM app.tasks t WHERE t.id=j.target_id AND t.version=j.resource_version AND t.state='OPEN') OR
  j.kind='MISSING_ARRIVAL' AND NOT EXISTS(SELECT 1 FROM app.occurrences o WHERE o.id=j.target_id AND o.version=j.resource_version AND o.status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM app.checkins c WHERE c.occurrence_id=o.id AND c.kind='ARRIVED' AND c.voided_at IS NULL)));
 INSERT INTO app_private.daily_jobs(child_id,target_id,kind,resource_version,available_at)
 SELECT o.child_id,o.id,'MISSING_ARRIVAL',o.version,o.starts_at+interval '10 minutes' FROM app.occurrences o
 JOIN app.children c ON c.id=o.child_id AND c.status='ACTIVE' JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL
 WHERE o.status='SCHEDULED' AND o.starts_at>now()-interval '1 day' AND o.starts_at<now()+interval '2 days'
 AND NOT EXISTS(SELECT 1 FROM app.checkins ci WHERE ci.occurrence_id=o.id AND ci.kind='ARRIVED' AND ci.voided_at IS NULL)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS total=ROW_COUNT;
 DELETE FROM app_private.daily_idempotency WHERE expires_at<=now();
 DELETE FROM app_private.daily_jobs WHERE finished_at<now()-interval '7 days';
 -- FK-safe retention. Replayed responses never outlive the source retention window.
 DELETE FROM app.checkins WHERE greatest(happened_at,created_at)<now()-interval '90 days';
 DELETE FROM app.learning_entries WHERE created_at<now()-interval '90 days';
 UPDATE app.learning_entries l SET task_id=NULL WHERE EXISTS(SELECT 1 FROM app.tasks t WHERE t.id=l.task_id AND t.closed_at<now()-interval '90 days');
 DELETE FROM app.tasks WHERE closed_at<now()-interval '90 days';
 DELETE FROM app.pickups WHERE closed_at<now()-interval '90 days';
 DELETE FROM app_private.daily_events WHERE created_at<now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM app.pickups WHERE id=target_id);
 RETURN jsonb_build_object('reserved',total,'delivery','P07_PENDING');
END $$;
DO $seal$ DECLARE fn regprocedure;signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['daily_member_name(uuid)','daily_assignee(uuid,uuid)','daily_dto(text,uuid)','daily_event(uuid,uuid,text,text,integer,uuid,text)','daily_command(text,jsonb)','daily_grant_revoked()','daily_maintenance()'] LOOP
  fn:=('app_private.'||signature)::regprocedure;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,app_runtime,worker_runtime',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO iharu_policy',fn);
  IF signature='daily_command(text,jsonb)' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime',fn);END IF;
  IF signature='daily_maintenance()' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO worker_runtime',fn);END IF;
  EXECUTE format('ALTER FUNCTION %s OWNER TO iharu_policy',fn);
 END LOOP;
END $seal$;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

