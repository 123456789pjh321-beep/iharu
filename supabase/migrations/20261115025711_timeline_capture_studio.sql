-- v2.0 compatible capture: private bytes, atomic note/attachment writes, scoped authorization.
CREATE TABLE app_private.workspace_memo_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), memo_id uuid NOT NULL REFERENCES app_private.workspace_memos(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 120),
 mime text NOT NULL CHECK(mime IN ('application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','audio/aac','image/jpeg','image/png')),
 kind text NOT NULL CHECK(kind IN ('FILE','AUDIO','SCAN','SKETCH')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 2000000),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 3)
);
CREATE INDEX workspace_memo_attachment_note ON app_private.workspace_memo_attachments(memo_id);
ALTER TABLE app_private.workspace_memo_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.workspace_memo_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY memo_attachment_policy ON app_private.workspace_memo_attachments TO iharu_policy
 USING(EXISTS(SELECT 1 FROM app_private.workspace_memos m WHERE m.id=memo_id))
 WITH CHECK(EXISTS(SELECT 1 FROM app_private.workspace_memos m WHERE m.id=memo_id));
REVOKE ALL ON app_private.workspace_memo_attachments FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.workspace_memo_attachments TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.workspace_memo_json(m app_private.workspace_memos,who uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('notebook','','bodyFormat','PLAIN','checklist','[]'::jsonb)||m.data||jsonb_build_object(
 'id',m.id,'ownerId',m.owner_id,'ownerName',(SELECT name FROM app_private.workspace_profiles WHERE id=m.owner_id),
 'mine',m.owner_id=who,'version',m.version,'createdAt',m.created_at,'updatedAt',m.updated_at,
 'favorite',EXISTS(SELECT 1 FROM app_private.workspace_memo_favorites WHERE profile_id=who AND memo_id=m.id),
 'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'width',width,'height',height) ORDER BY position),'[]') FROM app_private.workspace_memo_photos WHERE memo_id=m.id),
 'attachments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mime',mime,'kind',kind,'size',octet_length(bytes)) ORDER BY position),'[]') FROM app_private.workspace_memo_attachments WHERE memo_id=m.id))
$$;
ALTER FUNCTION app_private.workspace_memo_command(text,jsonb) RENAME TO workspace_memo_command_v20;
REVOKE ALL ON FUNCTION app_private.workspace_memo_command_v20(text,jsonb) FROM PUBLIC,app_runtime;
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.workspace_memo_command_v20(text,jsonb)'::regprocedure);
 IF position('n.data->>''tags''' IN source)=0 THEN RAISE EXCEPTION 'MEMO_SEARCH_SCHEMA_CHANGED'; END IF;
 source:=replace(source,'n.data->>''tags''','n.data->>''tags'',n.data->>''notebook'',n.data->>''checklist''');
 EXECUTE replace(source,'SELECT n.* FROM visible n WHERE','SELECT n.* FROM visible n WHERE (NOT p?''notebook'' OR coalesce(n.data->>''notebook'','''')=p->>''notebook'') AND');
END $$;
CREATE FUNCTION app_private.workspace_memo_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; m app_private.workspace_memos; a app_private.workspace_memo_attachments;
 old_data jsonb; extra jsonb; part jsonb; aid uuid; kept uuid[]='{}'; pos int=0; payload bytea; total_bytes bigint; selected_scope text;
BEGIN
 IF op NOT IN ('workspace.memos.save','workspace.memos.attachment','workspace.memos.notebooks') THEN RETURN app_private.workspace_memo_command_v20(op,p); END IF;
 identity:=app_private.workspace_command('workspace.me','{}'); who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.memos.notebooks' THEN
  RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',notebook,'count',total) ORDER BY notebook),'[]') FROM (SELECT n.data->>'notebook' AS notebook,count(*) AS total FROM app_private.workspace_memos n WHERE coalesce(n.data->>'notebook','')<>'' AND (n.owner_id=who OR n.data->>'visibility'='GROUP' AND app_private.workspace_can_read(who,n.owner_id)) GROUP BY n.data->>'notebook') notebooks));
 END IF;
 IF op='workspace.memos.attachment' THEN
  SELECT * INTO a FROM app_private.workspace_memo_attachments WHERE id=(p->>'id')::uuid;
  SELECT * INTO m FROM app_private.workspace_memos WHERE id=a.memo_id;
  IF m.id IS NULL OR NOT(m.owner_id=who OR m.data->>'visibility'='GROUP' AND app_private.workspace_can_read(who,m.owner_id)) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN jsonb_build_object('data',replace(encode(a.bytes,'base64'),E'\n',''),'mime',a.mime,'name',a.name);
 END IF;
 -- Same per-owner lock as v2.0: concurrent writes cannot bypass aggregate quotas.
 PERFORM 1 FROM app_private.workspace_profiles WHERE id=who FOR UPDATE;
 SELECT data INTO old_data FROM app_private.workspace_memos WHERE id=(p->>'id')::uuid;
 extra:=jsonb_build_object('notebook',coalesce(p->'notebook',old_data->'notebook','""'::jsonb),
 'bodyFormat',coalesce(p->'bodyFormat',old_data->'bodyFormat','"PLAIN"'::jsonb),
 'checklist',coalesce(p->'checklist',old_data->'checklist','[]'::jsonb));
 IF jsonb_typeof(extra->'notebook')<>'string' OR char_length(extra->>'notebook')>40
 OR jsonb_typeof(extra->'bodyFormat')<>'string' OR extra->>'bodyFormat' NOT IN ('PLAIN','MARKDOWN') OR jsonb_typeof(extra->'checklist')<>'array' OR jsonb_array_length(extra->'checklist')>50
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(extra->'checklist') c WHERE jsonb_typeof(c)<>'object' OR NOT c ?& ARRAY['id','text','done'] OR jsonb_typeof(c->'text')<>'string' OR char_length(btrim(c->>'text')) NOT BETWEEN 1 AND 240 OR jsonb_typeof(c->'done')<>'boolean' OR c->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 OR (SELECT count(*)<>count(DISTINCT c->>'id') FROM jsonb_array_elements(extra->'checklist') c)
 OR (p?'attachments' AND (jsonb_typeof(p->'attachments')<>'array' OR jsonb_array_length(p->'attachments')>4))
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM app_private.workspace_memo_command_v20(op,p);
 UPDATE app_private.workspace_memos SET data=data||extra WHERE id=(p->>'id')::uuid;
 -- Omitted attachments preserve bytes for older clients. Explicit [] removes them atomically.
 IF p?'attachments' THEN
  FOR part IN SELECT * FROM jsonb_array_elements(p->'attachments') LOOP
   IF part?'id' THEN
    aid:=(part->>'id')::uuid;
    IF aid=ANY(kept) OR NOT EXISTS(SELECT 1 FROM app_private.workspace_memo_attachments WHERE id=aid AND memo_id=(p->>'id')::uuid) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    UPDATE app_private.workspace_memo_attachments SET position=pos WHERE id=aid;
   ELSE
    payload:=decode(part->>'data','base64');
    IF payload IS NULL OR octet_length(payload) NOT BETWEEN 1 AND 2000000 OR octet_length(payload)<>(part->>'size')::int
    OR char_length(coalesce(part->>'name','')) NOT BETWEEN 1 AND 120 OR part->>'name' ~ '[[:cntrl:]/\\]'
    OR (part->>'kind'='AUDIO' AND part->>'mime' NOT LIKE 'audio/%')
    OR (part->>'kind' IN ('SCAN','SKETCH') AND part->>'mime' NOT IN ('image/jpeg','image/png'))
    THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    INSERT INTO app_private.workspace_memo_attachments(memo_id,name,mime,kind,bytes,position)
    VALUES((p->>'id')::uuid,part->>'name',part->>'mime',part->>'kind',payload,pos) RETURNING id INTO aid;
   END IF;
   kept:=array_append(kept,aid); pos:=pos+1;
  END LOOP;
  DELETE FROM app_private.workspace_memo_attachments WHERE memo_id=(p->>'id')::uuid AND NOT id=ANY(kept);
 END IF;
 SELECT coalesce((SELECT sum(octet_length(bytes)) FROM app_private.workspace_memo_photos WHERE memo_id=(p->>'id')::uuid),0)
 +coalesce((SELECT sum(octet_length(bytes)) FROM app_private.workspace_memo_attachments WHERE memo_id=(p->>'id')::uuid),0) INTO total_bytes;
 IF total_bytes>2800000 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 selected_scope:=current_setting('iharu.group_scope',true); PERFORM set_config('iharu.group_scope','',true);
 SELECT coalesce((SELECT sum(octet_length(att.bytes)) FROM app_private.workspace_memo_attachments att JOIN app_private.workspace_memos n ON n.id=att.memo_id WHERE n.owner_id=who),0)
 +coalesce((SELECT sum(octet_length(ph.bytes)) FROM app_private.workspace_memo_photos ph JOIN app_private.workspace_memos n ON n.id=ph.memo_id WHERE n.owner_id=who),0) INTO total_bytes;
 IF total_bytes>262144000 THEN RAISE EXCEPTION 'PHOTO_LIMIT'; END IF;
 PERFORM set_config('iharu.group_scope',selected_scope,true);
 SELECT * INTO m FROM app_private.workspace_memos WHERE id=(p->>'id')::uuid;
 RETURN app_private.workspace_memo_json(m,who);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_memo_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_memo_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
