-- P07-F08: short-lived, server-authorized receive-only private chat channels.
CREATE TABLE app_private.realtime_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES app.rooms(id) ON DELETE CASCADE,
 principal_id uuid NOT NULL,member_id uuid REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 session_id text,device_id uuid REFERENCES app.child_devices(id) ON DELETE CASCADE,
 epoch integer NOT NULL,start_seq bigint NOT NULL,expires_at timestamptz NOT NULL,
 CHECK ((member_id IS NOT NULL AND session_id IS NOT NULL AND device_id IS NULL) OR (member_id IS NULL AND session_id IS NULL AND device_id IS NOT NULL))
);
CREATE INDEX realtime_tickets_expiry ON app_private.realtime_tickets(expires_at);
ALTER TABLE app_private.realtime_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.realtime_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_executor ON app_private.realtime_tickets TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.realtime_tickets FROM PUBLIC,app_runtime,worker_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.realtime_tickets TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
GRANT TRIGGER ON app_private.message_jobs,app.message_reads,app.child_devices,app.rooms,iharu_auth.session,iharu_auth.members TO iharu_policy;
SET ROLE iharu_policy;

CREATE FUNCTION app_private.realtime_ticket(cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r app.rooms%ROWTYPE;mid uuid;did uuid;pid uuid;sid text;floor_seq bigint:=1;deadline timestamptz:=now()+interval '180 seconds';tid uuid;
BEGIN
 PERFORM 1 FROM app.families WHERE id=(SELECT family_id FROM app.children WHERE id=cid) FOR SHARE;
 PERFORM 1 FROM app.children WHERE id=cid FOR SHARE;
 IF NOT app_private.child_allowed(cid,'chat') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF app_private.guardian_ready() THEN
  mid:=app_private.actor();pid:=mid;sid:=current_setting('iharu.session_id',true);
  SELECT starts_seq INTO floor_seq FROM app.child_grants WHERE child_id=cid AND member_id=mid;
  SELECT least(deadline,s."expiresAt",g.absolute_expires_at) INTO deadline FROM iharu_auth.session s JOIN iharu_auth.session_guard g ON g.session_id=s.id WHERE s.id=sid;
 ELSE
  SELECT id,least(deadline,expires_at) INTO did,deadline FROM app.child_devices WHERE child_id=cid AND token_hash=nullif(current_setting('iharu.device_hash',true),'') AND status='ACTIVE' AND expires_at>now() AND last_seen_at>now()-interval '7 days';pid:=did;
 END IF;
 IF pid IS NULL OR deadline<=now() THEN RAISE EXCEPTION 'ACCESS_NOT_READY';END IF;
 SELECT * INTO r FROM app.rooms WHERE child_id=cid FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 DELETE FROM app_private.realtime_tickets WHERE id IN (SELECT id FROM app_private.realtime_tickets WHERE expires_at<=now() LIMIT 200);
 INSERT INTO app_private.realtime_tickets(room_id,principal_id,member_id,session_id,device_id,epoch,start_seq,expires_at)
 VALUES(r.id,pid,mid,sid,did,r.epoch,floor_seq,deadline) RETURNING id INTO tid;
 RETURN jsonb_build_object('ticket',tid,'principal',pid,'topic','child:'||cid||':chat:'||r.epoch,'expiresAt',deadline);
END $$;

-- Claims contain only an opaque ticket. Re-check live session, consent, grant and epoch.
CREATE FUNCTION app_private.realtime_allowed(topic_value text,claims jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(claims->>'role'='authenticated' AND claims->>'purpose'='iharu_chat' AND EXISTS(
 SELECT 1 FROM app_private.realtime_tickets t JOIN app.rooms r ON r.id=t.room_id
 JOIN app.children c ON c.id=r.child_id JOIN app.families f ON f.id=c.family_id
 WHERE t.id::text=claims->>'jti' AND t.principal_id::text=claims->>'sub' AND t.expires_at>now()
 AND r.epoch=t.epoch AND topic_value='child:'||c.id||':chat:'||r.epoch AND c.status='ACTIVE' AND f.status='ACTIVE'
 AND EXISTS(SELECT 1 FROM app.child_consents cc WHERE cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL)
 AND (
 t.member_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM iharu_auth.members a JOIN iharu_auth."user" u ON u.id=a.auth_user_id
  JOIN iharu_auth.session s ON s."userId"=u.id JOIN iharu_auth.session_guard sg ON sg.session_id=s.id
  JOIN app.memberships mm ON mm.member_id=a.id AND mm.family_id=c.family_id
  JOIN app.child_grants g ON g.member_id=a.id AND g.child_id=c.id
  WHERE a.id=t.member_id AND a.status='ACTIVE' AND a.access_ready AND u."emailVerified" AND u.email NOT LIKE '%@identity.iharu.invalid'
  AND s.id=t.session_id AND s."expiresAt">now() AND sg.absolute_expires_at>now() AND sg.last_seen_at>now()-interval '7 days' AND sg.assurance='HIGH'
  AND mm.status='ACTIVE' AND g.chat AND g.starts_seq=t.start_seq)
 OR t.device_id IS NOT NULL AND EXISTS(SELECT 1 FROM app.child_devices d WHERE d.id=t.device_id AND d.child_id=c.id AND d.status='ACTIVE' AND d.expires_at>now() AND d.last_seen_at>now()-interval '7 days')
 )),false)
$$;

-- A database enqueue is transactional; a provider outage must not roll back a message.
CREATE FUNCTION app_private.realtime_deliver(job_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j app_private.message_jobs%ROWTYPE;r app.rooms%ROWTYPE;v bigint;reset_event boolean;
BEGIN
 IF to_regclass('realtime.messages') IS NULL THEN RETURN false;END IF;
 SELECT * INTO j FROM app_private.message_jobs WHERE id=job_id;
 IF NOT FOUND OR j.state<>'PENDING' THEN RETURN false;END IF;
 SELECT * INTO r FROM app.rooms WHERE id=j.room_id FOR UPDATE;
 SELECT * INTO j FROM app_private.message_jobs WHERE id=job_id AND state='PENDING' FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT event_seq,kind='RESET' INTO v,reset_event FROM app_private.message_changes WHERE id=j.event_id;
 IF (r.epoch<>j.epoch AND NOT reset_event) OR j.created_at<=now()-interval '24 hours' OR (NOT reset_event AND NOT EXISTS(
 SELECT 1 FROM app.children c JOIN app.families f ON f.id=c.family_id JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL WHERE c.id=r.child_id AND c.status='ACTIVE' AND f.status='ACTIVE')) THEN
  UPDATE app_private.message_jobs SET state='CANCELLED' WHERE id=j.id;RETURN false;
 END IF;
 BEGIN
  EXECUTE 'INSERT INTO realtime.messages(id,payload,event,topic,private,extension) VALUES($1,$2,''change'',$3,true,''broadcast'')' USING j.event_id,jsonb_build_object('message_event_id',j.event_id,'version',v),'child:'||r.child_id||':chat:'||j.epoch;
  UPDATE app_private.message_jobs SET state='DONE' WHERE id=j.id;
  RETURN true;
 EXCEPTION WHEN OTHERS THEN
  -- Keep the outbox pending. Do not log provider payloads, SQL errors or credentials.
  RETURN false;
 END;
END $$;
CREATE FUNCTION app_private.realtime_job_created() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN PERFORM app_private.realtime_deliver(NEW.id);RETURN NEW;END $$;
CREATE TRIGGER realtime_job_created AFTER INSERT ON app_private.message_jobs FOR EACH ROW EXECUTE FUNCTION app_private.realtime_job_created();
CREATE FUNCTION app_private.realtime_flush() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE jid uuid;n integer:=0;
BEGIN
 IF to_regclass('realtime.messages') IS NULL THEN RETURN jsonb_build_object('state','NOT_CONNECTED','enqueued',0);END IF;
 FOR jid IN SELECT id FROM app_private.message_jobs WHERE state='PENDING' ORDER BY created_at,id LIMIT 100 LOOP
  IF app_private.realtime_deliver(jid) THEN n:=n+1;END IF;
 END LOOP;
 DELETE FROM app_private.realtime_tickets WHERE id IN (SELECT id FROM app_private.realtime_tickets WHERE expires_at<=now() LIMIT 200);
 DELETE FROM app_private.message_changes WHERE id IN (SELECT id FROM app_private.message_changes WHERE kind IN ('READ','RESET') AND created_at<=now()-interval '24 hours' LIMIT 200);
 RETURN jsonb_build_object('state','PROVIDER_ENQUEUE','enqueued',n,'backlog',EXISTS(SELECT 1 FROM app_private.message_jobs WHERE state='PENDING'));
END $$;
-- A read advances the change cursor once. Repeating the same receipt emits nothing.
CREATE FUNCTION app_private.realtime_read_changed() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE r app.rooms%ROWTYPE;eid uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.last_read_seq<=OLD.last_read_seq THEN RETURN NEW;END IF;
 UPDATE app.rooms SET last_event_seq=last_event_seq+1 WHERE id=NEW.room_id RETURNING * INTO r;
 INSERT INTO app_private.message_changes(room_id,event_seq,kind) VALUES(r.id,r.last_event_seq,'READ') RETURNING id INTO eid;
 INSERT INTO app_private.message_jobs(event_id,room_id,epoch) VALUES(eid,r.id,r.epoch);
 RETURN NEW;
END $$;
CREATE TRIGGER realtime_read_changed AFTER INSERT OR UPDATE ON app.message_reads FOR EACH ROW EXECUTE FUNCTION app_private.realtime_read_changed();
-- Explicit device withdrawal also rotates the channel. Mere last_seen updates do not.
CREATE FUNCTION app_private.realtime_device_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN UPDATE app.rooms SET epoch=epoch+1 WHERE child_id=OLD.child_id;RETURN OLD;END IF;
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.session_epoch IS DISTINCT FROM OLD.session_epoch OR NEW.expires_at<OLD.expires_at THEN UPDATE app.rooms SET epoch=epoch+1 WHERE child_id=NEW.child_id;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER realtime_device_changed AFTER UPDATE OR DELETE ON app.child_devices FOR EACH ROW EXECUTE FUNCTION app_private.realtime_device_changed();


-- Old subscribers get only a reset ID; subsequent content events use the new epoch.
CREATE FUNCTION app_private.realtime_epoch_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v bigint;eid uuid;
BEGIN
 UPDATE app.rooms SET last_event_seq=last_event_seq+1 WHERE id=NEW.id RETURNING last_event_seq INTO v;
 INSERT INTO app_private.message_changes(room_id,event_seq,kind) VALUES(NEW.id,v,'RESET') RETURNING id INTO eid;
 INSERT INTO app_private.message_jobs(event_id,room_id,epoch) VALUES(eid,NEW.id,OLD.epoch);
 RETURN NEW;
END $$;
CREATE TRIGGER realtime_epoch_changed AFTER UPDATE OF epoch ON app.rooms FOR EACH ROW WHEN (OLD.epoch IS DISTINCT FROM NEW.epoch) EXECUTE FUNCTION app_private.realtime_epoch_changed();
CREATE FUNCTION app_private.realtime_session_ended() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE app.rooms SET epoch=epoch+1 WHERE child_id IN (SELECT g.child_id FROM app.child_grants g JOIN iharu_auth.members m ON m.id=g.member_id WHERE m.auth_user_id=OLD."userId" AND g.chat);
 RETURN OLD;
END $$;
CREATE TRIGGER realtime_session_ended AFTER DELETE ON iharu_auth.session FOR EACH ROW EXECUTE FUNCTION app_private.realtime_session_ended();
CREATE FUNCTION app_private.realtime_member_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.access_ready IS DISTINCT FROM OLD.access_ready OR NEW.session_epoch IS DISTINCT FROM OLD.session_epoch THEN
  UPDATE app.rooms SET epoch=epoch+1 WHERE child_id IN (SELECT child_id FROM app.child_grants WHERE member_id=NEW.id AND chat);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER realtime_member_changed AFTER UPDATE ON iharu_auth.members FOR EACH ROW EXECUTE FUNCTION app_private.realtime_member_changed();

DO $$ DECLARE fn regprocedure;s text;BEGIN
 FOREACH s IN ARRAY ARRAY['realtime_ticket(uuid)','realtime_allowed(text,jsonb)','realtime_deliver(uuid)','realtime_job_created()','realtime_flush()','realtime_read_changed()','realtime_device_changed()','realtime_epoch_changed()','realtime_session_ended()','realtime_member_changed()'] LOOP
  fn:=('app_private.'||s)::regprocedure;EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,app_runtime,worker_runtime',fn);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app_private.realtime_ticket(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_private.realtime_flush() TO worker_runtime;
RESET ROLE;
-- Supabase-owned schema is absent in isolated PostgreSQL. Its real contract is tested separately.
DO $$ BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL THEN
  GRANT USAGE ON SCHEMA app_private TO authenticated;
  SET LOCAL ROLE iharu_policy;
  GRANT EXECUTE ON FUNCTION app_private.realtime_allowed(text,jsonb) TO authenticated;
  RESET ROLE;
  GRANT USAGE ON SCHEMA realtime TO iharu_policy;
  GRANT INSERT ON realtime.messages TO iharu_policy;
  CREATE POLICY iharu_chat_publish ON realtime.messages FOR INSERT TO iharu_policy WITH CHECK
   (extension='broadcast' AND private AND event='change' AND topic ~ '^child:[0-9a-f-]{36}:chat:[0-9]+$'
   AND payload ? 'message_event_id' AND payload ? 'version' AND payload-'message_event_id'-'version'='{}'::jsonb);
  CREATE POLICY iharu_chat_receive ON realtime.messages FOR SELECT TO authenticated
   USING (extension='broadcast' AND private AND app_private.realtime_allowed((SELECT realtime.topic()),(SELECT auth.jwt())));
  CREATE POLICY iharu_chat_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
   USING ((SELECT realtime.topic()) NOT LIKE 'child:%:chat:%' OR (extension='broadcast' AND private AND app_private.realtime_allowed((SELECT realtime.topic()),(SELECT auth.jwt()))));
  CREATE POLICY iharu_chat_no_client_send ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
   WITH CHECK ((SELECT realtime.topic()) NOT LIKE 'child:%:chat:%');
 END IF;
END $$;

SET ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.message_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor();principal uuid;actor_kind text;cid uuid;fid uuid;rid uuid;floor_seq bigint:=1;room app.rooms%ROWTYPE;m app.messages%ROWTYPE;
 receipt app_private.message_receipts%ROWTYPE;catalog app_private.message_catalog%ROWTYPE;keyrow app_private.message_keys%ROWTYPE;
 h text;kh text;items jsonb;reads_changed boolean;ids uuid[];seqs bigint[];token uuid;event_id uuid;lim integer;boundary bigint;meta jsonb:=jsonb_build_object('requestId',current_setting('iharu.request_id',true),'serverNow',now());
BEGIN
 IF app_private.guardian_ready() THEN principal:=actor;actor_kind:='GUARDIAN';
 ELSE SELECT id,child_id INTO principal,cid FROM app.child_devices WHERE token_hash=nullif(current_setting('iharu.device_hash',true),'') AND status='ACTIVE' AND expires_at>now() AND last_seen_at>now()-interval '7 days';actor_kind:='CHILD';END IF;
 IF principal IS NULL THEN RAISE EXCEPTION 'ACCESS_NOT_READY';END IF;
 IF op='rooms' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('childId',c.id,'childName',c.nickname,'familyId',c.family_id,'familyName',f.name) ORDER BY c.created_at,c.id),'[]') INTO items FROM app.children c JOIN app.families f ON f.id=c.family_id WHERE app_private.child_allowed(c.id,'chat');
  RETURN jsonb_build_object('data',items,'meta',meta);
 END IF;
 IF op='delete' THEN SELECT r.child_id INTO cid FROM app.messages mm JOIN app.rooms r ON r.id=mm.room_id WHERE mm.id=(p->>'id')::uuid;ELSE cid:=(p->>'childId')::uuid;END IF;
 SELECT family_id INTO fid FROM app.children WHERE id=cid;
 -- Match family-command locking order; grant withdrawal and sends cannot interleave.
 PERFORM 1 FROM app.families WHERE id=fid FOR SHARE;
 PERFORM 1 FROM app.children WHERE id=cid FOR SHARE;
 IF cid IS NULL OR NOT app_private.child_allowed(cid,'chat') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF actor_kind='GUARDIAN' THEN SELECT starts_seq INTO floor_seq FROM app.child_grants WHERE child_id=cid AND member_id=actor;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(principal::text,608));
 SELECT * INTO room FROM app.rooms WHERE child_id=cid FOR UPDATE;rid:=room.id;
 IF rid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF op IN ('list','changes') THEN
  lim:=least(coalesce((p->>'limit')::integer,30),50);
  IF op='changes' THEN
   SELECT * INTO receipt FROM app_private.message_receipts WHERE id=(p->>'cursor')::uuid AND principal_id=principal AND room_id=rid AND epoch=room.epoch AND start_seq=floor_seq AND expires_at>now();
   IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_RESET_REQUIRED';END IF;
   SELECT array_agg(x.message_id ORDER BY x.event_seq) FILTER(WHERE x.message_id IS NOT NULL),coalesce(max(x.event_seq),room.last_event_seq),coalesce(bool_or(x.kind='READ'),false) INTO ids,boundary,reads_changed FROM (SELECT mc.message_id,mc.event_seq,mc.kind FROM app_private.message_changes mc LEFT JOIN app.messages mm ON mm.id=mc.message_id WHERE mc.room_id=rid AND mc.event_seq>receipt.event_seq AND (mc.kind IN ('READ','RESET') OR mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days') ORDER BY mc.event_seq LIMIT lim) x;
   SELECT coalesce(jsonb_agg(app_private.message_dto(x,principal,floor_seq)) FILTER(WHERE app_private.message_dto(x,principal,floor_seq) IS NOT NULL),'[]') INTO items FROM unnest(ids) x;
   INSERT INTO app_private.message_receipts(room_id,principal_id,epoch,start_seq,event_seq,displayed_seqs) VALUES(rid,principal,room.epoch,floor_seq,boundary,'{}') RETURNING id INTO token;
   RETURN jsonb_build_object('data',jsonb_build_object('items',items,'cursor',token,'readsChanged',reads_changed,'hasMore',EXISTS(SELECT 1 FROM app_private.message_changes mc LEFT JOIN app.messages mm ON mm.id=mc.message_id WHERE mc.room_id=rid AND mc.event_seq>boundary AND (mc.kind IN ('READ','RESET') OR mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days'))),'meta',meta);
  END IF;
  SELECT array_agg(x.id ORDER BY x.seq),array_agg(x.seq ORDER BY x.seq) INTO ids,seqs FROM (
   SELECT mm.id,mm.seq FROM app.messages mm WHERE mm.room_id=rid AND mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days'
   AND (p->>'afterSeq' IS NULL OR mm.seq>floor_seq-1+(p->>'afterSeq')::bigint) AND (p->>'beforeSeq' IS NULL OR mm.seq<floor_seq-1+(p->>'beforeSeq')::bigint)
   ORDER BY CASE WHEN p->>'afterSeq' IS NOT NULL THEN mm.seq END ASC,mm.seq DESC LIMIT lim
  ) x;
  SELECT coalesce(jsonb_agg(app_private.message_dto(x,principal,floor_seq)),'[]') INTO items FROM unnest(ids) x;
  INSERT INTO app_private.message_receipts(room_id,principal_id,epoch,start_seq,event_seq,displayed_seqs) VALUES(rid,principal,room.epoch,floor_seq,room.last_event_seq,coalesce(seqs,'{}')) RETURNING id INTO token;
  RETURN jsonb_build_object('data',jsonb_build_object('childId',cid,'childName',(SELECT nickname FROM app.children WHERE id=cid),'items',items,'snapshotCursor',token,'receipt',token,'hasMore',EXISTS(SELECT 1 FROM app.messages mm WHERE mm.room_id=rid AND mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days' AND CASE WHEN p->>'afterSeq' IS NOT NULL THEN mm.seq>seqs[array_length(seqs,1)] ELSE mm.seq<seqs[1] END)),'meta',meta);
 END IF;
 IF op='read' THEN
  SELECT * INTO receipt FROM app_private.message_receipts WHERE id=(p->>'receipt')::uuid AND principal_id=principal AND room_id=rid AND epoch=room.epoch AND start_seq=floor_seq AND expires_at>now();
  boundary:=floor_seq-1+(p->>'lastReadSeq')::bigint;
  IF NOT FOUND OR NOT boundary=ANY(receipt.displayed_seqs) THEN RAISE EXCEPTION 'INVALID_READ_RECEIPT';END IF;
  INSERT INTO app.message_reads(room_id,principal_id,principal_kind,last_read_seq) VALUES(rid,principal,actor_kind,boundary) ON CONFLICT(room_id,principal_id) DO UPDATE SET last_read_seq=greatest(app.message_reads.last_read_seq,excluded.last_read_seq);
  RETURN jsonb_build_object('data',jsonb_build_object('saved',true),'meta',meta);
 END IF;
 IF op NOT IN ('send','delete') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 kh:=encode(sha256(convert_to((jsonb_build_object('op',op)|| (p-'key'))::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(principal::text||':'||(p->>'key'),606));
 SELECT * INTO keyrow FROM app_private.message_keys WHERE principal_id=principal AND key=p->>'key' AND expires_at>now();
 IF FOUND THEN
  IF keyrow.request_hash<>kh THEN RAISE EXCEPTION 'KEY_REUSED';END IF;
  RETURN jsonb_build_object('data',app_private.message_dto(keyrow.message_id,principal,floor_seq),'meta',meta);
 END IF;
 DELETE FROM app_private.message_keys WHERE principal_id=principal AND key=p->>'key';
 IF op='send' THEN
  h:=encode(sha256(convert_to((p-'key')::text,'UTF8')),'hex');
  -- Serialize client IDs across rooms too; the response cannot be moved into another room.
  PERFORM pg_advisory_xact_lock(hashtextextended(principal::text||':'||(p->>'clientMessageId'),607));
  SELECT * INTO m FROM app.messages WHERE sender=principal AND client_message_id=(p->>'clientMessageId')::uuid;
  IF FOUND THEN IF m.request_hash<>h OR m.room_id<>rid THEN RAISE EXCEPTION 'KEY_REUSED';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM app.messages WHERE sender=principal AND created_at>clock_timestamp()-interval '1 second') OR (SELECT count(*) FROM app.messages WHERE sender=principal AND created_at>clock_timestamp()-interval '1 minute')>=30 THEN RAISE EXCEPTION 'RATE_LIMITED';END IF;
   IF p->>'kind'='STICKER' THEN
    IF (p->>'catalogVersion')::int NOT IN (1,2) THEN RAISE EXCEPTION 'CATALOG_VERSION_UNSUPPORTED';END IF;
    SELECT * INTO catalog FROM app_private.message_catalog WHERE version=(p->>'catalogVersion')::int AND id=p->>'catalogId' AND NOT EXISTS(SELECT 1 FROM app_private.message_retired WHERE id=p->>'catalogId');
    IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_ITEM_UNAVAILABLE';END IF;
   END IF;
   UPDATE app.rooms SET last_seq=last_seq+1,last_event_seq=last_event_seq+1 WHERE id=rid RETURNING * INTO room;
   INSERT INTO app.messages(room_id,seq,sender,sender_kind,client_message_id,kind,body,catalog_id,catalog_version,label_snapshot,emoji_snapshot,request_hash)
   VALUES(rid,room.last_seq,principal,actor_kind,(p->>'clientMessageId')::uuid,p->>'kind',p->>'body',catalog.id,catalog.version,catalog.label,catalog.emoji,h) RETURNING * INTO m;
   INSERT INTO app_private.message_changes(room_id,event_seq,message_id,kind) VALUES(rid,room.last_event_seq,m.id,'CREATED') RETURNING id INTO event_id;
   INSERT INTO app_private.message_jobs(event_id,room_id,epoch) VALUES(event_id,rid,room.epoch);
  END IF;
 ELSE
  SELECT * INTO m FROM app.messages WHERE id=(p->>'id')::uuid AND room_id=rid AND seq>=floor_seq;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF m.sender<>principal THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
  IF m.deleted_at IS NULL THEN
   IF m.version<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT';END IF;
   UPDATE app.messages SET body=NULL,catalog_id=NULL,catalog_version=NULL,label_snapshot=NULL,emoji_snapshot=NULL,deleted_at=now(),version=version+1 WHERE id=m.id;
   UPDATE app.rooms SET last_event_seq=last_event_seq+1 WHERE id=rid RETURNING * INTO room;
   UPDATE app_private.message_jobs j SET state='CANCELLED' WHERE j.event_id IN (SELECT id FROM app_private.message_changes WHERE message_id=m.id);
   INSERT INTO app_private.message_changes(room_id,event_seq,message_id,kind) VALUES(rid,room.last_event_seq,m.id,'DELETED') RETURNING id INTO event_id;
   INSERT INTO app_private.message_jobs(event_id,room_id,epoch) VALUES(event_id,rid,room.epoch);
  END IF;
 END IF;
 INSERT INTO app_private.message_keys(principal_id,key,request_hash,message_id) VALUES(principal,p->>'key',kh,m.id);
 RETURN jsonb_build_object('data',app_private.message_dto(m.id,principal,floor_seq),'meta',meta);
END $$;
RESET ROLE;

SET ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.message_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n integer;delivery jsonb;BEGIN
 DELETE FROM app.messages WHERE id IN (SELECT id FROM app.messages WHERE created_at<=now()-interval '90 days' ORDER BY created_at LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM app_private.message_receipts WHERE id IN (SELECT id FROM app_private.message_receipts WHERE expires_at<=now() LIMIT 200);
 DELETE FROM app_private.message_keys WHERE ctid IN (SELECT ctid FROM app_private.message_keys WHERE expires_at<=now() LIMIT 200);
 UPDATE app_private.message_jobs SET state='EXPIRED' WHERE id IN (SELECT id FROM app_private.message_jobs WHERE state='PENDING' AND created_at<=now()-interval '24 hours' LIMIT 200);
 DELETE FROM app_private.message_jobs WHERE id IN (SELECT id FROM app_private.message_jobs WHERE state<>'PENDING' AND created_at<=now()-interval '7 days' LIMIT 200);
 delivery:=app_private.realtime_flush();
 RETURN jsonb_build_object('expired',n,'delivery',delivery->>'state','realtime',delivery);
END $$;
RESET ROLE;
REVOKE TRIGGER ON app_private.message_jobs,app.message_reads,app.child_devices,app.rooms,iharu_auth.session,iharu_auth.members FROM iharu_policy;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

