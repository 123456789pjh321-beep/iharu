-- Retain notes and their private attachments until the author explicitly purges them.
ALTER TABLE app_private.workspace_memos ADD COLUMN deleted_at timestamptz;
CREATE INDEX workspace_memos_trash ON app_private.workspace_memos(owner_id,space_id,deleted_at DESC,id) WHERE deleted_at IS NOT NULL;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.workspace_memo_command_v20(text,jsonb)'::regprocedure);
 IF position('page.updated_at,page.space_id)' IN source)=0
 OR position('SELECT n.* FROM app_private.workspace_memos n WHERE n.owner_id=who OR' IN source)=0
 OR position('DELETE FROM app_private.workspace_memos WHERE workspace_memos.id=target_id;' IN source)=0
 THEN RAISE EXCEPTION 'MEMO_TRASH_SCHEMA_CHANGED'; END IF;
 source:=replace(source,'page.updated_at,page.space_id)','page.updated_at,page.space_id,page.deleted_at)');
 source:=replace(source,'SELECT n.* FROM app_private.workspace_memos n WHERE n.owner_id=who OR n.data->>''visibility''=''GROUP'' AND app_private.workspace_can_read(who,n.owner_id)',
 'SELECT n.* FROM app_private.workspace_memos n WHERE n.deleted_at IS NULL AND (n.owner_id=who OR n.data->>''visibility''=''GROUP'' AND app_private.workspace_can_read(who,n.owner_id))');
 -- Photos, favorites and saves cannot bypass the trash lifecycle, even via older clients.
 source:=replace(source,'IF m.id IS NULL OR NOT (','IF m.id IS NULL OR m.deleted_at IS NOT NULL OR NOT (');
 source:=replace(source,'expected:=(p->>''version'')::int;',E'IF m.deleted_at IS NOT NULL THEN RAISE EXCEPTION ''NOT_FOUND''; END IF;\n expected:=(p->>''version'')::int;');
 source:=replace(source,'DELETE FROM app_private.workspace_memos WHERE workspace_memos.id=target_id;',
 'UPDATE app_private.workspace_memos SET deleted_at=now(),updated_at=now(),version=version+1 WHERE workspace_memos.id=target_id;');
 EXECUTE source;
 source:=pg_get_functiondef('app_private.workspace_memo_command(text,jsonb)'::regprocedure);
 IF position('WHERE coalesce(n.data->>''notebook''' IN source)=0 OR position('IF m.id IS NULL OR NOT(' IN source)=0 THEN RAISE EXCEPTION 'MEMO_CAPTURE_SCHEMA_CHANGED'; END IF;
 source:=replace(source,'WHERE coalesce(n.data->>''notebook''','WHERE n.deleted_at IS NULL AND coalesce(n.data->>''notebook''');
 source:=replace(source,'IF m.id IS NULL OR NOT(','IF m.id IS NULL OR m.deleted_at IS NOT NULL OR NOT(');
 EXECUTE source;
END $$;
ALTER FUNCTION app_private.workspace_memo_command(text,jsonb) RENAME TO workspace_memo_command_capture;
REVOKE ALL ON FUNCTION app_private.workspace_memo_command_capture(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_memo_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; m app_private.workspace_memos; result jsonb; required_publication uuid;
BEGIN
 IF op NOT IN ('workspace.memos.trash.list','workspace.memos.trash.restore','workspace.memos.trash.purge') THEN
  RETURN app_private.workspace_memo_command_capture(op,p);
 END IF;
 -- workspace.me validates the requested group and sets the same RLS scope used by all note operations.
 identity:=app_private.workspace_command('workspace.me','{}'); who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.memos.trash.list' THEN
  IF coalesce((p->>'limit')::int,20) NOT BETWEEN 1 AND 100 OR coalesce((p->>'offset')::int,0) NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  WITH trashed AS MATERIALIZED (
   SELECT * FROM app_private.workspace_memos WHERE owner_id=who AND deleted_at IS NOT NULL
  ), page AS (
   SELECT * FROM trashed ORDER BY deleted_at DESC,id LIMIT coalesce((p->>'limit')::int,20) OFFSET coalesce((p->>'offset')::int,0)
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM trashed),'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',n.id,'title',n.data->>'title','date',n.data->>'date','version',n.version,'deletedAt',n.deleted_at,
    'photoCount',(SELECT count(*) FROM app_private.workspace_memo_photos WHERE memo_id=n.id),
    'attachmentCount',(SELECT count(*) FROM app_private.workspace_memo_attachments WHERE memo_id=n.id)) ORDER BY n.deleted_at DESC,n.id) FROM page n),'[]')) INTO result;
  RETURN result;
 END IF;
 IF (p->>'version') IS NULL OR (p->>'version')::int<1 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 -- Share the save/delete quota lock so restore, purge and stale edits cannot race.
 PERFORM 1 FROM app_private.workspace_profiles WHERE id=who FOR UPDATE;
 SELECT * INTO m FROM app_private.workspace_memos WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF m.id IS NULL OR m.owner_id<>who OR m.deleted_at IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF m.version<>(p->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF op='workspace.memos.trash.restore' THEN
  IF identity->>'role'='PARENT' THEN
   PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
   SELECT publication.id INTO required_publication FROM app_private.legal_publications publication ORDER BY version DESC LIMIT 1;
   IF required_publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances a WHERE a.member_id=app_private.actor() AND a.publication_id=required_publication AND a.withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  END IF;
  UPDATE app_private.workspace_memos SET deleted_at=NULL,updated_at=now(),version=version+1 WHERE id=m.id;
 ELSE
  -- This is the only public note command that destroys bytes; FK cascades remove attachments and favorites.
  DELETE FROM app_private.workspace_memos WHERE id=m.id;
 END IF;
 RETURN jsonb_build_object('date',m.data->>'date');
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_memo_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_memo_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
