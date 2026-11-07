-- P07 inbox foundation. No external Push/Realtime delivery is claimed by this migration.
CREATE TABLE app_private.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES app.children(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN ('chat','daily')),kind text NOT NULL,
 target_id uuid NOT NULL, message_seq bigint, grant_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,version integer NOT NULL DEFAULT 1,
 UNIQUE(event_id,recipient_id)
);
CREATE INDEX notifications_recipient_time ON app_private.notifications(recipient_id,created_at DESC,id);
ALTER TABLE app_private.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_executor ON app_private.notifications TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.notifications FROM PUBLIC,app_runtime,worker_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.notifications TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;

-- Called only by policy-owned business triggers/worker, inside their transaction.
CREATE FUNCTION app_private.notification_emit(eid uuid,cid uuid,category_value text,kind_value text,target uuid,sender uuid,seq_value bigint DEFAULT NULL) RETURNS void LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
 INSERT INTO app_private.notifications(event_id,recipient_id,child_id,category,kind,target_id,message_seq,grant_version)
 SELECT eid,g.member_id,cid,category_value,kind_value,target,seq_value,g.version
 FROM app.child_grants g JOIN app.memberships mm ON mm.family_id=g.family_id AND mm.member_id=g.member_id
 JOIN app.children c ON c.id=g.child_id JOIN app.families f ON f.id=c.family_id
 JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL
 JOIN iharu_auth.members a ON a.id=g.member_id
 WHERE g.child_id=cid AND mm.status='ACTIVE' AND c.status='ACTIVE' AND f.status='ACTIVE' AND a.status='ACTIVE'
 AND g.member_id IS DISTINCT FROM sender
 AND (category_value='chat' AND g.chat AND seq_value>=g.starts_seq OR category_value='daily' AND g.daily)
 ON CONFLICT(event_id,recipient_id) DO NOTHING
$$;
CREATE FUNCTION app_private.notification_message_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE m app.messages%ROWTYPE;cid uuid;
BEGIN
 SELECT * INTO m FROM app.messages WHERE id=NEW.message_id;
 SELECT child_id INTO cid FROM app.rooms WHERE id=NEW.room_id;
 IF NEW.kind='CREATED' THEN PERFORM app_private.notification_emit(NEW.id,cid,'chat','MESSAGE',m.id,m.sender,m.seq);
 ELSIF NEW.kind='DELETED' THEN DELETE FROM app_private.notifications WHERE category='chat' AND target_id=NEW.message_id;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_message_event AFTER INSERT ON app_private.message_changes FOR EACH ROW EXECUTE FUNCTION app_private.notification_message_event();
CREATE FUNCTION app_private.notification_daily_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- Replace superseded notices rather than leaving an obsolete action in the inbox.
 DELETE FROM app_private.notifications WHERE category='daily' AND target_id=NEW.target_id;
 IF NEW.resource_type IN ('CHECKIN','TASK','PICKUP') AND NEW.kind NOT IN ('CANCELLED','DELETED','VOIDED') THEN
  PERFORM app_private.notification_emit(NEW.id,NEW.child_id,'daily',NEW.resource_type,NEW.target_id,NEW.actor_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_daily_event AFTER INSERT ON app_private.daily_events FOR EACH ROW EXECUTE FUNCTION app_private.notification_daily_event();
CREATE FUNCTION app_private.notification_schedule_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 DELETE FROM app_private.notifications WHERE category='daily' AND target_id=NEW.target_id;
 PERFORM app_private.notification_emit(NEW.id,NEW.child_id,'daily',NEW.kind,NEW.target_id,app_private.actor());
 RETURN NEW;
END $$;
CREATE TRIGGER notification_schedule_event AFTER INSERT ON app_private.schedule_events FOR EACH ROW EXECUTE FUNCTION app_private.notification_schedule_event();
CREATE FUNCTION app_private.notification_visible(n app_private.notifications) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT n.recipient_id=app_private.actor() AND app_private.guardian_ready() AND n.created_at>now()-interval '30 days'
 AND app_private.child_allowed(n.child_id,n.category)
 AND EXISTS(SELECT 1 FROM app.child_grants g WHERE g.child_id=n.child_id AND g.member_id=n.recipient_id AND g.version=n.grant_version)
 AND (n.category<>'chat' OR EXISTS(SELECT 1 FROM app.messages m JOIN app.rooms r ON r.id=m.room_id JOIN app.child_grants g ON g.child_id=r.child_id AND g.member_id=n.recipient_id WHERE m.id=n.target_id AND m.deleted_at IS NULL AND m.seq>=g.starts_seq))
$$;
CREATE FUNCTION app_private.notification_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor();note app_private.notifications%ROWTYPE;items jsonb;boundary timestamptz;boundary_id uuid;
BEGIN
 IF NOT app_private.guardian_ready() THEN RAISE EXCEPTION 'ACCESS_NOT_READY';END IF;
 IF op='notifications.read' THEN
  SELECT * INTO note FROM app_private.notifications x WHERE x.id=(p->>'id')::uuid AND app_private.notification_visible(x) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF note.read_at IS NULL THEN
   IF note.version<>(p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   UPDATE app_private.notifications SET read_at=now(),version=version+1 WHERE id=note.id;
  END IF;
  RETURN jsonb_build_object('data',jsonb_build_object('saved',true));
 END IF;
 IF op<>'notifications.list' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF p->>'before' IS NOT NULL THEN
  SELECT x.created_at,x.id INTO boundary,boundary_id FROM app_private.notifications x WHERE x.id=(p->>'before')::uuid AND app_private.notification_visible(x);
  IF boundary IS NULL THEN RAISE EXCEPTION 'SYNC_RESET_REQUIRED';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'childId',x.child_id,'category',x.category,'kind',x.kind,'createdAt',x.created_at,'readAt',x.read_at,'version',x.version) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO items
 FROM (SELECT n.* FROM app_private.notifications n WHERE app_private.notification_visible(n) AND (boundary IS NULL OR (n.created_at,n.id)<(boundary,boundary_id)) ORDER BY n.created_at DESC,n.id DESC LIMIT 31) x;
 RETURN jsonb_build_object('data',jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>30 THEN items-30 ELSE items END,'hasMore',jsonb_array_length(items)>30,'pushAvailable',false,'realtimeAvailable',false));
END $$;
CREATE FUNCTION app_private.notification_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j app_private.daily_jobs%ROWTYPE;total integer:=0;valid boolean;
BEGIN
 FOR j IN SELECT * FROM app_private.daily_jobs WHERE state='PENDING' AND available_at<=now() ORDER BY available_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  valid:=j.available_at>now()-interval '1 hour' AND EXISTS(SELECT 1 FROM app.children c JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL WHERE c.id=j.child_id AND c.status='ACTIVE');
  IF j.kind='TASK_DUE' THEN valid:=valid AND EXISTS(SELECT 1 FROM app.tasks t WHERE t.id=j.target_id AND t.version=j.resource_version AND t.state='OPEN');
  ELSIF j.kind='MISSING_ARRIVAL' THEN valid:=valid AND EXISTS(SELECT 1 FROM app.occurrences o WHERE o.id=j.target_id AND o.version=j.resource_version AND o.status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM app.checkins ci WHERE ci.occurrence_id=o.id AND ci.kind='ARRIVED' AND ci.voided_at IS NULL));
  ELSE valid:=false; -- PICKUP_CHANGED is already emitted transactionally by its event trigger.
  END IF;
  IF valid THEN PERFORM app_private.notification_emit(j.id,j.child_id,'daily',j.kind,j.target_id,NULL);total:=total+1;END IF;
  UPDATE app_private.daily_jobs SET state=CASE WHEN valid THEN 'DONE' ELSE 'CANCELLED' END,finished_at=now() WHERE id=j.id;
 END LOOP;
 DELETE FROM app_private.notifications WHERE created_at<=now()-interval '30 days';
 RETURN jsonb_build_object('inboxJobs',total,'push','NOT_CONNECTED','realtime','NOT_CONNECTED');
END $$;
DO $$ DECLARE signature text;fn regprocedure;BEGIN
 FOREACH signature IN ARRAY ARRAY['notification_emit(uuid,uuid,text,text,uuid,uuid,bigint)','notification_message_event()','notification_daily_event()','notification_schedule_event()','notification_visible(app_private.notifications)','notification_command(text,jsonb)','notification_maintenance()'] LOOP
  fn:=('app_private.'||signature)::regprocedure;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,app_runtime,worker_runtime',fn);
  IF signature='notification_command(text,jsonb)' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime',fn);END IF;
  IF signature='notification_maintenance()' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO worker_runtime',fn);END IF;
  EXECUTE format('ALTER FUNCTION %s OWNER TO iharu_policy',fn);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

