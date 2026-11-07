-- P06: private command boundary; no direct message access for API/runtime roles.
ALTER TABLE app.rooms ADD COLUMN last_event_seq bigint NOT NULL DEFAULT 0;
CREATE TABLE app.messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES app.rooms(id),seq bigint NOT NULL,
 sender uuid NOT NULL,sender_kind text NOT NULL CHECK(sender_kind IN ('GUARDIAN','CHILD')),client_message_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('TEXT','STICKER')),body text,catalog_id text,catalog_version integer,label_snapshot text,emoji_snapshot text,
 request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,version integer NOT NULL DEFAULT 1,
 UNIQUE(room_id,seq),UNIQUE(sender,client_message_id),
 CHECK(CASE WHEN deleted_at IS NOT NULL THEN body IS NULL AND catalog_id IS NULL AND catalog_version IS NULL AND label_snapshot IS NULL AND emoji_snapshot IS NULL
 WHEN kind='TEXT' THEN length(body) BETWEEN 1 AND 2000 AND catalog_id IS NULL AND catalog_version IS NULL AND label_snapshot IS NULL AND emoji_snapshot IS NULL
 ELSE body IS NULL AND catalog_id IS NOT NULL AND catalog_version IS NOT NULL AND label_snapshot IS NOT NULL AND emoji_snapshot IS NOT NULL END)
);
CREATE INDEX messages_retention ON app.messages(created_at);
CREATE TABLE app.message_reads(room_id uuid NOT NULL REFERENCES app.rooms(id),principal_id uuid NOT NULL,principal_kind text NOT NULL,last_read_seq bigint NOT NULL,PRIMARY KEY(room_id,principal_id));
CREATE TABLE app_private.message_catalog(version integer NOT NULL,id text NOT NULL,emoji text NOT NULL,label text NOT NULL,PRIMARY KEY(version,id));
CREATE TABLE app_private.message_retired(id text PRIMARY KEY);
CREATE TABLE app_private.message_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES app.rooms(id),event_seq bigint NOT NULL,message_id uuid REFERENCES app.messages(id) ON DELETE CASCADE,kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(room_id,event_seq));
CREATE TABLE app_private.message_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL UNIQUE REFERENCES app_private.message_changes(id) ON DELETE CASCADE,room_id uuid NOT NULL REFERENCES app.rooms(id),epoch integer NOT NULL,state text NOT NULL DEFAULT 'PENDING',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX message_jobs_pending ON app_private.message_jobs(created_at,id) WHERE state='PENDING';
CREATE TABLE app_private.message_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES app.rooms(id),principal_id uuid NOT NULL,epoch integer NOT NULL,start_seq bigint NOT NULL,event_seq bigint NOT NULL,displayed_seqs bigint[] NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours');
CREATE INDEX message_receipts_expiry ON app_private.message_receipts(expires_at);
CREATE TABLE app_private.message_keys(principal_id uuid NOT NULL,key text NOT NULL,request_hash text NOT NULL,message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(principal_id,key));
CREATE INDEX message_keys_expiry ON app_private.message_keys(expires_at);

INSERT INTO app_private.message_catalog(version,id,emoji,label) VALUES
(1,'hello','👋','안녕하세요'),
(1,'arrived','🏫','도착했어요'),
(1,'finished','✅','끝났어요'),
(1,'waiting','🪑','기다릴게요'),
(1,'eating','🍚','밥 먹어요'),
(1,'resting','🛋️','쉬고 있어요'),
(1,'leaving','🎒','이제 출발해요'),
(1,'home','🏠','집에 왔어요'),
(1,'bus','🚌','버스를 탔어요'),
(1,'walk','🚶','걸어가요'),
(1,'pickup','🚗','데리러 와 주세요'),
(1,'where','📍','어디에서 만나요'),
(1,'happy','😄','기분이 좋아요'),
(1,'sad','😢','슬퍼요'),
(1,'worried','😟','걱정돼요'),
(1,'angry','😠','화가 나요'),
(1,'tired','🥱','피곤해요'),
(1,'excited','🤩','신나요'),
(1,'help','🙋','도와주세요'),
(1,'hurt','🤒','몸이 아파요'),
(1,'hungry','🍙','배가 고파요'),
(1,'water','💧','목이 말라요'),
(1,'call','📞','전화해 주세요'),
(1,'wait','⏳','조금 기다려 주세요'),
(1,'love','💛','사랑해요'),
(1,'thanks','🤗','고마워요'),
(1,'sorry','🙏','미안해요'),
(1,'miss','🥰','보고 싶어요'),
(1,'cheer','💪','응원해요'),
(1,'goodnight','🌙','잘 자요'),
(1,'yes','👍','알겠어요'),
(1,'no','🙅','아니에요'),
(1,'okay','👌','괜찮아요'),
(1,'again','🔁','다시 알려 주세요'),
(1,'soon','🕐','조금 뒤에요'),
(1,'dontknow','🤔','잘 모르겠어요'),
(2,'hello','👋','안녕하세요'),
(2,'arrived','🏫','도착했어요'),
(2,'finished','✅','끝났어요'),
(2,'waiting','🪑','기다릴게요'),
(2,'eating','🍚','밥 먹어요'),
(2,'resting','🛋️','쉬고 있어요'),
(2,'leaving','🎒','이제 출발해요'),
(2,'home','🏠','집에 왔어요'),
(2,'bus','🚌','버스를 탔어요'),
(2,'walk','🚶','걸어가요'),
(2,'pickup','🚗','데리러 와 주세요'),
(2,'where','📍','어디에서 만나요'),
(2,'happy','😄','기분이 좋아요'),
(2,'sad','😢','슬퍼요'),
(2,'worried','😟','걱정돼요'),
(2,'angry','😠','화가 나요'),
(2,'tired','🥱','피곤해요'),
(2,'excited','🤩','신나요'),
(2,'help','🙋','도와주세요'),
(2,'hurt','🤒','몸이 아파요'),
(2,'hungry','🍙','배가 고파요'),
(2,'water','💧','목이 말라요'),
(2,'call','📞','전화해 주세요'),
(2,'wait','⏳','조금 기다려 주세요'),
(2,'love','💛','사랑해요'),
(2,'thanks','🤗','고마워요'),
(2,'sorry','🙏','미안해요'),
(2,'miss','🥰','보고 싶어요'),
(2,'cheer','💪','응원해요'),
(2,'goodnight','🌙','잘 자요'),
(2,'yes','👍','알겠어요'),
(2,'no','🙅','아니에요'),
(2,'okay','👌','괜찮아요'),
(2,'again','🔁','다시 알려 주세요'),
(2,'soon','🕐','조금 뒤예요'),
(2,'dontknow','🤔','잘 모르겠어요');
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['app.messages','app.message_reads','app_private.message_catalog','app_private.message_retired','app_private.message_changes','app_private.message_jobs','app_private.message_receipts','app_private.message_keys'] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY policy_executor ON %s TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %s TO iharu_policy',t);
 END LOOP;
END $$;
CREATE FUNCTION app_private.message_dto(mid uuid,viewer uuid,start_seq bigint) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',m.id,'seq',m.seq-start_seq+1,'kind',m.kind,'body',CASE WHEN m.deleted_at IS NULL THEN coalesce(m.body,m.label_snapshot) END,
 'displayText',CASE WHEN m.deleted_at IS NULL THEN coalesce(m.body,m.label_snapshot) END,'emoji',m.emoji_snapshot,'catalogId',m.catalog_id,'catalogVersion',m.catalog_version,
 'createdAt',m.created_at,'deletedAt',m.deleted_at,'version',m.version,'mine',m.sender=viewer,
 'senderName',CASE WHEN m.sender_kind='CHILD' THEN c.nickname ELSE coalesce((SELECT u.name FROM iharu_auth.members a JOIN iharu_auth."user" u ON u.id=a.auth_user_id WHERE a.id=m.sender),'가족') END,
 'readByOther',m.deleted_at IS NULL AND EXISTS(SELECT 1 FROM app.message_reads r WHERE r.room_id=m.room_id AND r.principal_id<>m.sender AND NOT(m.sender_kind='CHILD' AND r.principal_kind='CHILD') AND r.last_read_seq>=m.seq AND (
 r.principal_kind='GUARDIAN' AND EXISTS(SELECT 1 FROM app.child_grants g JOIN app.memberships mm ON mm.family_id=g.family_id AND mm.member_id=g.member_id JOIN iharu_auth.members a ON a.id=g.member_id WHERE g.child_id=c.id AND g.member_id=r.principal_id AND g.chat AND g.starts_seq<=m.seq AND mm.status='ACTIVE' AND a.status='ACTIVE')
 OR r.principal_kind='CHILD' AND EXISTS(SELECT 1 FROM app.child_devices d WHERE d.id=r.principal_id AND d.child_id=c.id AND d.status='ACTIVE' AND d.expires_at>now() AND d.last_seen_at>now()-interval '7 days'))))
 FROM app.messages m JOIN app.rooms room ON room.id=m.room_id JOIN app.children c ON c.id=room.child_id WHERE m.id=mid AND m.seq>=start_seq
$$;
CREATE FUNCTION app_private.message_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor();principal uuid;actor_kind text;cid uuid;fid uuid;rid uuid;floor_seq bigint:=1;room app.rooms%ROWTYPE;m app.messages%ROWTYPE;
 receipt app_private.message_receipts%ROWTYPE;catalog app_private.message_catalog%ROWTYPE;keyrow app_private.message_keys%ROWTYPE;
 h text;kh text;items jsonb;ids uuid[];seqs bigint[];token uuid;event_id uuid;lim integer;boundary bigint;meta jsonb:=jsonb_build_object('requestId',current_setting('iharu.request_id',true),'serverNow',now());
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
   SELECT array_agg(x.message_id ORDER BY x.event_seq),coalesce(max(x.event_seq),room.last_event_seq) INTO ids,boundary FROM (SELECT mc.message_id,mc.event_seq FROM app_private.message_changes mc JOIN app.messages mm ON mm.id=mc.message_id WHERE mc.room_id=rid AND mc.event_seq>receipt.event_seq AND mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days' ORDER BY mc.event_seq LIMIT lim) x;
   SELECT coalesce(jsonb_agg(app_private.message_dto(x,principal,floor_seq)) FILTER(WHERE app_private.message_dto(x,principal,floor_seq) IS NOT NULL),'[]') INTO items FROM unnest(ids) x;
   INSERT INTO app_private.message_receipts(room_id,principal_id,epoch,start_seq,event_seq,displayed_seqs) VALUES(rid,principal,room.epoch,floor_seq,boundary,'{}') RETURNING id INTO token;
   RETURN jsonb_build_object('data',jsonb_build_object('items',items,'cursor',token,'hasMore',EXISTS(SELECT 1 FROM app_private.message_changes mc JOIN app.messages mm ON mm.id=mc.message_id WHERE mc.room_id=rid AND mc.event_seq>boundary AND mm.seq>=floor_seq AND mm.created_at>now()-interval '90 days')),'meta',meta);
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
CREATE FUNCTION app_private.message_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n integer;BEGIN
 DELETE FROM app.messages WHERE created_at<=now()-interval '90 days';GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM app_private.message_receipts WHERE expires_at<=now();DELETE FROM app_private.message_keys WHERE expires_at<=now();
 DELETE FROM app_private.message_jobs WHERE created_at<=now()-interval '7 days';
 RETURN jsonb_build_object('expired',n,'delivery','P07_NOT_CONNECTED');
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
DO $seal$ DECLARE fn regprocedure;signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['message_dto(uuid,uuid,bigint)','message_command(text,jsonb)','message_maintenance()'] LOOP
  fn:=('app_private.'||signature)::regprocedure;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,app_runtime,worker_runtime',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO iharu_policy',fn);
  IF signature='message_command(text,jsonb)' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime',fn);END IF;
  IF signature='message_maintenance()' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO worker_runtime',fn);END IF;
  EXECUTE format('ALTER FUNCTION %s OWNER TO iharu_policy',fn);
 END LOOP;
END $seal$;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

