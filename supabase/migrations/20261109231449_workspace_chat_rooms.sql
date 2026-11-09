-- UI130: fixed participant rooms within the current sharing group.
-- Existing null-room messages remain in the default group conversation.
CREATE TABLE app_private.workspace_chat_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 family_id uuid NOT NULL REFERENCES app_private.workspace_families(id) ON DELETE CASCADE,
 creator_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('DIRECT','GROUP')),
 name text NOT NULL CHECK(length(name)<=60),
 direct_key text, client_request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(creator_id,client_request_id), UNIQUE(family_id,direct_key)
);
CREATE TABLE app_private.workspace_chat_members (
 room_id uuid NOT NULL REFERENCES app_private.workspace_chat_rooms(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 link_version integer NOT NULL,
 PRIMARY KEY(room_id,profile_id)
);
CREATE INDEX workspace_chat_member_rooms ON app_private.workspace_chat_members(profile_id,room_id);
ALTER TABLE app_private.workspace_items ADD COLUMN chat_room_id uuid REFERENCES app_private.workspace_chat_rooms(id);
ALTER TABLE app_private.workspace_items ADD CONSTRAINT workspace_chat_room_kind CHECK(chat_room_id IS NULL OR kind='CHAT');
CREATE INDEX workspace_room_history ON app_private.workspace_items(chat_room_id,created_at DESC,id DESC) WHERE kind='CHAT' AND deleted_at IS NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_chat_rooms','workspace_chat_members'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY room_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_room_member(who uuid,rid uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM app_private.workspace_chat_rooms r
  JOIN app_private.workspace_chat_members m ON m.room_id=r.id AND m.profile_id=who
  JOIN app_private.workspace_links l ON l.family_id=r.family_id AND l.profile_id=m.profile_id AND l.active AND l.version=m.link_version
  WHERE r.id=rid)
$$;
REVOKE ALL ON FUNCTION app_private.workspace_room_member(uuid,uuid) FROM PUBLIC,app_runtime;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v129;
REVOKE ALL ON FUNCTION app_private.workspace_command_v129(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; fid uuid; rid uuid; chosen uuid[]; membership_key text;
 room app_private.workspace_chat_rooms; item app_private.workspace_items;
 result jsonb; people jsonb; count_found int; page_size int; oldest jsonb; viewed bigint; pub uuid;
BEGIN
 IF op NOT IN ('workspace.me','workspace.chat.rooms','workspace.chat.room.create','workspace.chat.list','workspace.chat.send','workspace.items.list','workspace.items.get','workspace.items.update','workspace.items.delete') THEN
  RETURN app_private.workspace_command_v129(op,p);
 END IF;
 identity:=app_private.workspace_command_v129('workspace.me','{}');who:=(identity->>'id')::uuid;fid:=(identity->'family'->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.me' THEN
  -- Display only the old automatically generated group name with the new label.
  IF identity->'family'->>'name'=(SELECT left(name,30)||'의 가족' FROM app_private.workspace_profiles WHERE id=(identity->'family'->>'hostId')::uuid) THEN
   identity:=jsonb_set(identity,'{family,name}',to_jsonb(regexp_replace(identity->'family'->>'name','의 가족$','의 그룹')));
  END IF;
  RETURN identity;
 END IF;
 IF op IN ('workspace.chat.send','workspace.chat.room.create') AND app_private.account_verified() THEN
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO pub FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF pub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=app_private.actor() AND publication_id=pub AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
 END IF;
 -- The family row serializes participant snapshots against removal/switching.
 IF op='workspace.chat.room.create' THEN
  IF fid IS NULL THEN RAISE EXCEPTION 'GROUP_REQUIRED'; END IF;
  PERFORM id FROM app_private.workspace_families WHERE id=fid FOR UPDATE;
  SELECT array_agg(value::uuid ORDER BY value::uuid) INTO chosen FROM jsonb_array_elements_text(p->'memberIds');
  IF coalesce(cardinality(chosen),0) NOT BETWEEN 1 AND 99 OR who=ANY(chosen)
   OR cardinality(chosen)<>(SELECT count(DISTINCT id) FROM unnest(chosen) id) OR length(coalesce(p->>'name',''))>60 OR p->>'clientRequestId' IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  chosen:=array_append(chosen,who);
  SELECT count(*),string_agg(l.profile_id::text||':'||l.version,',' ORDER BY l.profile_id) INTO count_found,membership_key
   FROM app_private.workspace_links l WHERE l.family_id=fid AND l.active AND l.profile_id=ANY(chosen);
  IF count_found<>cardinality(chosen) THEN RAISE EXCEPTION 'ROOM_MEMBER_INVALID'; END IF;
  SELECT * INTO room FROM app_private.workspace_chat_rooms WHERE creator_id=who AND client_request_id=(p->>'clientRequestId')::uuid;
  IF FOUND THEN
   IF room.family_id<>fid OR room.name<>coalesce(p->>'name','') OR NOT app_private.workspace_room_member(who,room.id)
    OR (SELECT array_agg(m.profile_id ORDER BY m.profile_id) FROM app_private.workspace_chat_members m WHERE m.room_id=room.id) IS DISTINCT FROM (SELECT array_agg(v ORDER BY v) FROM unnest(chosen) v)
    THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',room.id);
  END IF;
  IF cardinality(chosen)=2 THEN
   SELECT * INTO room FROM app_private.workspace_chat_rooms WHERE family_id=fid AND direct_key=membership_key;
   IF FOUND THEN RETURN jsonb_build_object('id',room.id); END IF;
  END IF;
  IF (SELECT count(*) FROM app_private.workspace_chat_rooms WHERE family_id=fid)>=1000 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
  INSERT INTO app_private.workspace_chat_rooms(family_id,creator_id,kind,name,direct_key,client_request_id)
   VALUES(fid,who,CASE WHEN cardinality(chosen)=2 THEN 'DIRECT' ELSE 'GROUP' END,coalesce(p->>'name',''),CASE WHEN cardinality(chosen)=2 THEN membership_key END,(p->>'clientRequestId')::uuid) RETURNING id INTO rid;
  INSERT INTO app_private.workspace_chat_members(room_id,profile_id,link_version)
   SELECT rid,l.profile_id,l.version FROM app_private.workspace_links l WHERE l.family_id=fid AND l.active AND l.profile_id=ANY(chosen);
  RETURN jsonb_build_object('id',rid);
 ELSIF op='workspace.chat.rooms' THEN
  SELECT coalesce(jsonb_agg(q.data ORDER BY q.stamp DESC,q.id),'[]'::jsonb) INTO result FROM (
   SELECT r.id,coalesce(last_item.created_at,r.created_at) stamp,jsonb_build_object('id',r.id,'kind',r.kind,
    'name',CASE WHEN r.kind='DIRECT' THEN (SELECT pp.name FROM app_private.workspace_chat_members m JOIN app_private.workspace_profiles pp ON pp.id=m.profile_id WHERE m.room_id=r.id AND m.profile_id<>who LIMIT 1)
      ELSE coalesce(nullif(r.name,''),'선택한 구성원 대화') END,
    'members',(SELECT jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'kind',pp.kind,'active',app_private.workspace_room_member(pp.id,r.id)) ORDER BY pp.id) FROM app_private.workspace_chat_members m JOIN app_private.workspace_profiles pp ON pp.id=m.profile_id WHERE m.room_id=r.id),
    'canSend',(SELECT count(*)>=2 FROM app_private.workspace_chat_members m WHERE m.room_id=r.id AND app_private.workspace_room_member(m.profile_id,r.id)),
    'updatedAt',coalesce(last_item.created_at,r.created_at),'lastMessage',left(last_item.data->>'note',100)) data
   FROM app_private.workspace_chat_rooms r LEFT JOIN LATERAL (SELECT i.created_at,i.data FROM app_private.workspace_items i WHERE i.chat_room_id=r.id AND i.deleted_at IS NULL ORDER BY i.created_at DESC,i.id DESC LIMIT 1) last_item ON true
   WHERE r.family_id=fid AND app_private.workspace_room_member(who,r.id)
  ) q;
  RETURN jsonb_build_object('items',result);
 ELSIF op IN ('workspace.items.get','workspace.items.update','workspace.items.delete') THEN
  SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'id')::uuid;
  IF item.chat_room_id IS NOT NULL THEN
   IF NOT app_private.workspace_room_member(who,item.chat_room_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF op='workspace.items.update' AND p->>'kind'<>'CHAT' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF op='workspace.items.get' THEN
    IF item.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    RETURN jsonb_build_object('id',item.id,'kind',item.kind,'data',item.data,'ownerId',item.owner_id,'ownerName',(SELECT name FROM app_private.workspace_profiles WHERE id=item.owner_id),'mine',item.owner_id=who,'version',item.version,'createdAt',item.created_at,'updatedAt',item.updated_at);
   END IF;
  END IF;
  RETURN app_private.workspace_command_v129(op,p);
 ELSIF op='workspace.items.list' THEN
  result:=app_private.workspace_command_v129(op,p);
  SELECT coalesce(jsonb_agg(e.value ORDER BY e.n),'[]'::jsonb) INTO people
   FROM jsonb_array_elements(result->'items') WITH ORDINALITY e(value,n)
   JOIN app_private.workspace_items i ON i.id=(e.value->>'id')::uuid
   WHERE i.chat_room_id IS NULL OR app_private.workspace_room_member(who,i.chat_room_id);
  RETURN jsonb_set(result,'{items}',people);
 END IF;
 rid:=(p->>'roomId')::uuid;
 IF rid IS NOT NULL THEN
  IF NOT app_private.workspace_room_member(who,rid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM id FROM app_private.workspace_families WHERE id=fid FOR SHARE;
  -- Revalidate after acquiring the lock, including a participant removed while waiting.
  IF NOT app_private.workspace_room_member(who,rid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 END IF;
 IF op='workspace.chat.send' THEN
  IF rid IS NULL THEN
   IF EXISTS(SELECT 1 FROM app_private.workspace_items WHERE owner_id=who AND client_message_id=(p->>'clientMessageId')::uuid AND chat_room_id IS NOT NULL) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   RETURN app_private.workspace_command_v129(op,p);
  END IF;
  IF (SELECT count(*) FROM app_private.workspace_chat_members m WHERE m.room_id=rid AND app_private.workspace_room_member(m.profile_id,rid))<2 THEN RAISE EXCEPTION 'ROOM_READ_ONLY'; END IF;
  IF coalesce(length(btrim(p->>'text')),0) NOT BETWEEN 1 AND 5000 OR p->>'clientMessageId' IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text||(p->>'clientMessageId'),78));
  SELECT * INTO item FROM app_private.workspace_items WHERE owner_id=who AND client_message_id=(p->>'clientMessageId')::uuid;
  IF FOUND THEN
   IF item.chat_room_id IS DISTINCT FROM rid OR item.data->>'note'<>btrim(p->>'text') THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',item.id,'version',item.version);
  END IF;
  INSERT INTO app_private.workspace_items(owner_id,kind,data,client_message_id,chat_room_id)
   VALUES(who,'CHAT',jsonb_build_object('title',left(btrim(p->>'text'),80),'note',btrim(p->>'text'),'date',to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD'),'weekdays','[]'::jsonb,'place','','paid',false),(p->>'clientMessageId')::uuid,rid) RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'version',item.version);
 END IF;
 page_size:=coalesce((p->>'limit')::int,50);
 IF page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p->>'query',''))>100 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT revision INTO viewed FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu='chat';
 WITH recent AS (
  SELECT i.*,pp.name FROM app_private.workspace_items i JOIN app_private.workspace_profiles pp ON pp.id=i.owner_id
  WHERE i.kind='CHAT' AND i.deleted_at IS NULL AND i.chat_room_id IS NOT DISTINCT FROM rid
   AND (rid IS NOT NULL OR app_private.workspace_can_read(who,i.owner_id))
   AND (p->'before' IS NULL OR (i.created_at,i.id)<((p->'before'->>'createdAt')::timestamptz,(p->'before'->>'id')::uuid))
   AND (coalesce(p->>'query','')='' OR position(lower(p->>'query') in lower(i.data->>'note'))>0)
  ORDER BY i.created_at DESC,i.id DESC LIMIT page_size+1
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY created_at DESC,id DESC) n FROM recent)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'data',data,'ownerId',owner_id,'ownerName',name,'mine',owner_id=who,'version',version,'createdAt',created_at,'updatedAt',updated_at) ORDER BY created_at,id) FILTER(WHERE n<=page_size),'[]'::jsonb),count(*) INTO result,count_found FROM numbered;
 oldest:=result->0;
 RETURN jsonb_build_object('items',result,'hasMore',count_found>page_size,'nextCursor',CASE WHEN count_found>page_size THEN jsonb_build_object('id',oldest->>'id','createdAt',oldest->>'createdAt') ELSE NULL END)
  ||CASE WHEN p?'before' OR coalesce(p->>'query','')<>'' THEN '{}'::jsonb ELSE jsonb_build_object('updateReceipt',jsonb_build_object('profileId',who,'menu','chat','revision',coalesce(viewed,0))) END;
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

-- Participant checks also apply to badges, queued push and delivery-time revalidation.
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.workspace_menu_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target uuid; writer uuid:=app_private.workspace_actor(); menu_name text;
BEGIN
 IF TG_TABLE_NAME='workspace_items' THEN
  IF TG_OP='UPDATE' AND NEW.version=OLD.version AND NEW.data=OLD.data AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW; END IF;
  menu_name:=CASE NEW.kind WHEN 'REPEAT' THEN 'timetable' WHEN 'EVENT' THEN 'calendar' WHEN 'CHAT' THEN 'chat' WHEN 'FEE' THEN 'fees' WHEN 'NOTE' THEN 'records' END;
  FOR target IN SELECT p.id FROM app_private.workspace_profiles p
   WHERE p.id IS DISTINCT FROM writer AND app_private.workspace_can_read(p.id,NEW.owner_id)
   AND (NEW.kind<>'FEE' OR p.kind='PARENT')
   AND (NEW.chat_room_id IS NULL OR app_private.workspace_room_member(p.id,NEW.chat_room_id)) ORDER BY p.id LOOP
   INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(target,menu_name)
    ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1;
  END LOOP;
 ELSE
  IF TG_OP='UPDATE' AND NEW.active IS NOT DISTINCT FROM OLD.active THEN RETURN NEW; END IF;
  -- A family switch must not retain unread data from a former sharing group.
  UPDATE app_private.workspace_menu_updates SET seen_revision=revision WHERE profile_id=NEW.profile_id AND menu<>'family';
  FOR target IN SELECT DISTINCT p.id FROM app_private.workspace_profiles p
   WHERE p.id IS DISTINCT FROM writer AND (TG_OP<>'INSERT' OR p.id<>NEW.profile_id)
   AND (p.id=NEW.profile_id OR EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.profile_id=p.id AND l.family_id=NEW.family_id AND l.active)) ORDER BY p.id LOOP
   INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(target,'family')
    ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app_private.workspace_push_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.kind NOT IN ('EVENT','CHAT') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.kind='CHAT' OR (NEW.version=OLD.version AND NEW.data=OLD.data AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at) THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO app_private.workspace_push_outbox(subscription_id,item_id,item_version,reason,dedupe_key,expires_at,menu_revision,family_id,recipient_link,author_link)
 SELECT s.id,NEW.id,NEW.version,CASE NEW.kind WHEN 'CHAT' THEN 'chat' ELSE 'calendar-change' END,
 NEW.kind||':'||NEW.id||':'||NEW.version,now()+interval '15 minutes',coalesce(u.revision,0),r.family_id,r.version,a.version
 FROM app_private.workspace_push_subscriptions s
 JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id
 JOIN app_private.workspace_links r ON r.profile_id=s.profile_id AND r.active
 JOIN app_private.workspace_links a ON a.profile_id=NEW.owner_id AND a.family_id=r.family_id AND a.active
 LEFT JOIN app_private.workspace_menu_updates u ON u.profile_id=s.profile_id AND u.menu=CASE NEW.kind WHEN 'CHAT' THEN 'chat' ELSE 'calendar' END
 WHERE s.profile_id<>NEW.owner_id AND s.profile_id IS DISTINCT FROM app_private.workspace_actor() AND app_private.workspace_push_session(s)
 AND (NEW.chat_room_id IS NULL OR app_private.workspace_room_member(s.profile_id,NEW.chat_room_id))
 AND CASE NEW.kind WHEN 'CHAT' THEN p.chat ELSE p.calendar_changes END
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app_private.workspace_push_valid(q app_private.workspace_push_outbox,s app_private.workspace_push_subscriptions) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.workspace_push_session(s) AND q.expires_at>now() AND (q.reason='test' OR EXISTS(
 SELECT 1 FROM app_private.workspace_items i JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id
 WHERE i.id=q.item_id AND i.version=q.item_version AND app_private.workspace_can_read(s.profile_id,i.owner_id)
 AND (i.chat_room_id IS NULL OR app_private.workspace_room_member(s.profile_id,i.chat_room_id))
 AND (q.reason='calendar-change' OR i.deleted_at IS NULL)
 AND CASE q.reason WHEN 'chat' THEN i.kind='CHAT' AND p.chat WHEN 'calendar-change' THEN i.kind='EVENT' AND p.calendar_changes WHEN 'calendar-reminder' THEN i.kind='EVENT' AND p.calendar_reminders ELSE false END
 AND (i.owner_id=s.profile_id OR EXISTS(SELECT 1 FROM app_private.workspace_links r JOIN app_private.workspace_links a ON a.family_id=r.family_id AND a.profile_id=i.owner_id AND a.active AND a.version=q.author_link WHERE r.profile_id=s.profile_id AND r.active AND r.family_id=q.family_id AND r.version=q.recipient_link))
 AND (q.reason NOT IN ('chat','calendar-change') OR q.menu_revision=0 OR NOT EXISTS(SELECT 1 FROM app_private.workspace_menu_updates u WHERE u.profile_id=s.profile_id AND u.menu=CASE q.reason WHEN 'chat' THEN 'chat' ELSE 'calendar' END AND u.seen_revision>=q.menu_revision))
 ))
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
