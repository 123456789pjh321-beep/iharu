-- UI78: atomic parent-family switching and cursor-based group conversation.
ALTER TABLE app_private.workspace_items ADD COLUMN client_message_id uuid;
CREATE UNIQUE INDEX workspace_message_idempotency ON app_private.workspace_items(owner_id,client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX workspace_chat_history ON app_private.workspace_items(created_at DESC,id DESC) WHERE kind='CHAT' AND deleted_at IS NULL;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v77;
REVOKE ALL ON FUNCTION app_private.workspace_command_v77(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; current_link app_private.workspace_links%ROWTYPE;
 inv app_private.workspace_invites%ROWTYPE; item app_private.workspace_items%ROWTYPE;
 result jsonb; page_size int; found_count int; oldest jsonb;
BEGIN
 IF op='workspace.family.join' AND p->'leaveCurrent' IS NOT NULL THEN
  identity:=app_private.workspace_command_v77('workspace.me','{}');who:=(identity->>'id')::uuid;
  IF identity->>'role'<>'PARENT' THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  SELECT * INTO inv FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' FOR UPDATE;
  IF NOT FOUND OR inv.used_by IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at<=now() THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  IF inv.host_id=who THEN RAISE EXCEPTION 'OWN_CODE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,76));
  PERFORM id FROM app_private.workspace_families WHERE id IN (inv.family_id,(p->'leaveCurrent'->>'familyId')::uuid) ORDER BY id FOR UPDATE;
  SELECT * INTO current_link FROM app_private.workspace_links WHERE profile_id=who AND active FOR UPDATE;
  IF NOT FOUND OR current_link.family_id<>(p->'leaveCurrent'->>'familyId')::uuid OR current_link.version<>(p->'leaveCurrent'->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF current_link.family_id=inv.family_id THEN RAISE EXCEPTION 'ALREADY_LINKED'; END IF;
  -- Existing leave rules preserve non-empty host families and all authored data.
  -- Any failure to join rolls this leave back in the same transaction.
  PERFORM app_private.workspace_command_v77('workspace.family.leave',p->'leaveCurrent');
  RETURN app_private.workspace_command_v77(op,p);
 ELSIF op IN ('workspace.chat.list','workspace.chat.send') THEN
  identity:=app_private.workspace_command_v77('workspace.me','{}');who:=(identity->>'id')::uuid;
  IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF op='workspace.chat.send' THEN
   IF coalesce(length(btrim(p->>'text')),0) NOT BETWEEN 1 AND 5000 OR p->>'clientMessageId' IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(who::text||(p->>'clientMessageId'),78));
   SELECT * INTO item FROM app_private.workspace_items WHERE owner_id=who AND client_message_id=(p->>'clientMessageId')::uuid;
   IF FOUND THEN
    IF item.data->>'note'<>btrim(p->>'text') THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
    RETURN jsonb_build_object('id',item.id,'version',item.version);
   END IF;
   INSERT INTO app_private.workspace_items(owner_id,kind,data,client_message_id) VALUES(who,'CHAT',jsonb_build_object('title',left(btrim(p->>'text'),80),'note',btrim(p->>'text'),'date',to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD'),'weekdays','[]'::jsonb,'place','','paid',false),(p->>'clientMessageId')::uuid) RETURNING * INTO item;
   RETURN jsonb_build_object('id',item.id,'version',item.version);
  END IF;
  page_size:=coalesce((p->>'limit')::int,50);
  IF page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p->>'query',''))>100 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  WITH recent AS (
   SELECT i.*,pp.name FROM app_private.workspace_items i JOIN app_private.workspace_profiles pp ON pp.id=i.owner_id
   WHERE i.kind='CHAT' AND i.deleted_at IS NULL AND app_private.workspace_can_read(who,i.owner_id)
   AND (p->'before' IS NULL OR (i.created_at,i.id)<((p->'before'->>'createdAt')::timestamptz,(p->'before'->>'id')::uuid))
   AND (coalesce(p->>'query','')='' OR position(lower(p->>'query') in lower(i.data->>'note'))>0)
   ORDER BY i.created_at DESC,i.id DESC LIMIT page_size+1
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY created_at DESC,id DESC) AS n FROM recent)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'data',data,'ownerId',owner_id,'ownerName',name,'mine',owner_id=who,'version',version,'createdAt',created_at,'updatedAt',updated_at) ORDER BY created_at,id) FILTER(WHERE n<=page_size),'[]'::jsonb),count(*) INTO result,found_count FROM numbered;
  oldest:=result->0;
  RETURN jsonb_build_object('items',result,'hasMore',found_count>page_size,'nextCursor',CASE WHEN found_count>page_size THEN jsonb_build_object('id',oldest->>'id','createdAt',oldest->>'createdAt') ELSE NULL END);
 END IF;
 RETURN app_private.workspace_command_v77(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
