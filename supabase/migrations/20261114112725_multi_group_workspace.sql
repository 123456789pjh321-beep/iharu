-- Multiple memberships, explicit personal/group spaces, and scoped compatibility for existing commands.
-- Existing shared records stay in their existing group; private memos remain personal.
SELECT pg_advisory_xact_lock(17091701);
SELECT pg_advisory_xact_lock(hashtextextended('workspace-group-transition',20261114));
DROP INDEX app_private.workspace_one_family;
ALTER TABLE app_private.workspace_families ADD COLUMN created_by uuid REFERENCES app_private.workspace_profiles(id) ON DELETE SET NULL,
 ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=240),
 ADD COLUMN color integer NOT NULL DEFAULT 0 CHECK(color BETWEEN 0 AND 5), ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN archived_at timestamptz, ADD COLUMN create_key uuid;
CREATE UNIQUE INDEX workspace_group_create_retry ON app_private.workspace_families(created_by,create_key) WHERE create_key IS NOT NULL;
ALTER TABLE app_private.workspace_profiles ADD COLUMN selected_group_id uuid REFERENCES app_private.workspace_families(id) ON DELETE SET NULL,
 ADD COLUMN group_filter_preferences jsonb NOT NULL DEFAULT '{}';
ALTER TABLE app_private.workspace_items ADD COLUMN space_id uuid REFERENCES app_private.workspace_families(id) ON DELETE SET NULL;
ALTER TABLE app_private.workspace_memos ADD COLUMN space_id uuid REFERENCES app_private.workspace_families(id) ON DELETE SET NULL;
CREATE INDEX workspace_items_space ON app_private.workspace_items(coalesce(space_id::text,'personal'),owner_id,kind) WHERE deleted_at IS NULL;
CREATE INDEX workspace_chat_space_history ON app_private.workspace_items(coalesce(space_id::text,'personal'),chat_room_id,created_at DESC,id DESC) WHERE kind='CHAT' AND deleted_at IS NULL;
CREATE INDEX workspace_memos_space ON app_private.workspace_memos(coalesce(space_id::text,'personal'),owner_id,(data->>'date'));
CREATE INDEX workspace_active_profile_groups ON app_private.workspace_links(profile_id,family_id) WHERE active;
ALTER TABLE app_private.workspace_ledger_budgets ADD COLUMN space_key text NOT NULL DEFAULT 'personal';
ALTER TABLE app_private.workspace_ledger_budgets DROP CONSTRAINT workspace_ledger_budgets_pkey;
ALTER TABLE app_private.workspace_ledger_budgets ADD PRIMARY KEY(profile_id,space_key,month,member_key);

SET LOCAL ROLE iharu_policy;
UPDATE app_private.workspace_families SET archived_at=created_at WHERE NOT EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.family_id=workspace_families.id AND l.active);
UPDATE app_private.workspace_profiles p SET selected_group_id=l.family_id FROM app_private.workspace_links l WHERE l.profile_id=p.id AND l.active;
UPDATE app_private.workspace_profiles SET group_filter_preferences=jsonb_build_object(coalesce(selected_group_id::text,'personal'),member_filter_preferences||jsonb_build_object('timetable',coalesce(to_jsonb(timetable_member_ids),jsonb_build_array(coalesce(timetable_member_id,id)))));
-- A record created before the current membership may have been personal. Keep
-- it private. Optional chat rooms already carry their actual group explicitly.
UPDATE app_private.workspace_items i SET space_id=l.family_id FROM app_private.workspace_links l
 WHERE l.profile_id=i.owner_id AND l.active AND i.created_at>=l.joined_at AND i.chat_room_id IS NULL;
UPDATE app_private.workspace_items i SET space_id=r.family_id FROM app_private.workspace_chat_rooms r WHERE r.id=i.chat_room_id;
UPDATE app_private.workspace_memos n SET space_id=l.family_id FROM app_private.workspace_links l
 WHERE l.profile_id=n.owner_id AND l.active AND n.created_at>=l.joined_at AND n.data->>'visibility'='GROUP';
UPDATE app_private.workspace_memos SET data=jsonb_set(data,'{visibility}','"PRIVATE"') WHERE space_id IS NULL AND data->>'visibility'='GROUP';
UPDATE app_private.workspace_ledger_budgets b SET space_key=p.selected_group_id::text FROM app_private.workspace_profiles p
 JOIN app_private.workspace_links l ON l.profile_id=p.id AND l.family_id=p.selected_group_id AND l.active
 WHERE p.id=b.profile_id AND b.updated_at>=l.joined_at;
RESET ROLE;

-- The policy role is NOLOGIN/NOBYPASSRLS. Empty scope is reserved for internal management/workers.
-- Runtime clients cannot read these tables or call the compatibility implementations directly.
ALTER POLICY workspace_policy ON app_private.workspace_links USING(coalesce(current_setting('iharu.group_scope',true),'')='' OR family_id::text=current_setting('iharu.group_scope',true)) WITH CHECK(coalesce(current_setting('iharu.group_scope',true),'')='' OR family_id::text=current_setting('iharu.group_scope',true));
ALTER POLICY workspace_policy ON app_private.workspace_items USING(coalesce(current_setting('iharu.group_scope',true),'')='' OR coalesce(space_id::text,'personal')=current_setting('iharu.group_scope',true)) WITH CHECK(coalesce(current_setting('iharu.group_scope',true),'')='' OR coalesce(space_id::text,'personal')=current_setting('iharu.group_scope',true));
ALTER POLICY memo_policy ON app_private.workspace_memos USING(coalesce(current_setting('iharu.group_scope',true),'')='' OR coalesce(space_id::text,'personal')=current_setting('iharu.group_scope',true)) WITH CHECK(coalesce(current_setting('iharu.group_scope',true),'')='' OR coalesce(space_id::text,'personal')=current_setting('iharu.group_scope',true));
ALTER POLICY ledger_budget_policy ON app_private.workspace_ledger_budgets USING(coalesce(current_setting('iharu.group_scope',true),'')='' OR space_key=current_setting('iharu.group_scope',true)) WITH CHECK(coalesce(current_setting('iharu.group_scope',true),'')='' OR space_key=current_setting('iharu.group_scope',true));
GRANT TRIGGER ON app_private.workspace_items,app_private.workspace_memos,app_private.workspace_ledger_budgets TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_space_on_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE selected text:=coalesce(nullif(current_setting('iharu.group_scope',true),''),'personal');
BEGIN
 IF TG_TABLE_NAME='workspace_ledger_budgets' THEN NEW.space_key:=selected;
 ELSE NEW.space_id:=nullif(selected,'personal')::uuid; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_space_insert BEFORE INSERT ON app_private.workspace_items FOR EACH ROW EXECUTE FUNCTION app_private.workspace_space_on_insert();
CREATE FUNCTION app_private.workspace_memo_space() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.space_id:=nullif(nullif(current_setting('iharu.group_scope',true),''),'personal')::uuid; END IF;
 IF NEW.space_id IS NULL THEN NEW.data:=jsonb_set(NEW.data,'{visibility}','"PRIVATE"'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_memo_scope BEFORE INSERT OR UPDATE ON app_private.workspace_memos FOR EACH ROW EXECUTE FUNCTION app_private.workspace_memo_space();
CREATE TRIGGER workspace_budget_space_insert BEFORE INSERT ON app_private.workspace_ledger_budgets FOR EACH ROW EXECUTE FUNCTION app_private.workspace_space_on_insert();
CREATE FUNCTION app_private.workspace_item_visible(viewer uuid,item app_private.workspace_items) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT viewer=item.owner_id OR (item.space_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM app_private.workspace_links a JOIN app_private.workspace_links b ON b.family_id=a.family_id AND b.active
  JOIN app_private.workspace_families f ON f.id=a.family_id AND f.archived_at IS NULL
  WHERE a.profile_id=viewer AND a.active AND b.profile_id=item.owner_id AND a.family_id=item.space_id))
$$;
CREATE FUNCTION app_private.workspace_group_json(fid uuid,who uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'description',f.description,'color',f.color,'version',f.version,'hostId',f.host_id,'isHost',f.host_id=who,
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,'host',p.id=f.host_id,'version',l.version) ORDER BY l.joined_at,p.id)
 FROM app_private.workspace_links l JOIN app_private.workspace_profiles p ON p.id=l.profile_id WHERE l.family_id=f.id AND l.active),'[]'::jsonb))
 FROM app_private.workspace_families f WHERE f.id=fid AND f.archived_at IS NULL
$$;
-- The memo row type includes the space column. Read the account's photo quota across all of its spaces.
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.workspace_memo_command(text,jsonb)'::regprocedure);
 IF position('page.created_at,page.updated_at)' in source)=0 THEN RAISE EXCEPTION 'MEMO_SCHEMA_CHANGED'; END IF;
 source:=replace(source,'page.created_at,page.updated_at)','page.created_at,page.updated_at,page.space_id)');
 source:=replace(source,'required_publication uuid; target_id uuid; expected integer;','required_publication uuid; target_id uuid; expected integer; memo_scope text;');
 source:=replace(source,' IF (SELECT coalesce(sum(octet_length(ph.bytes)),0)', E' memo_scope:=current_setting(''iharu.group_scope'',true);\n PERFORM set_config(''iharu.group_scope'','''',true);\n IF (SELECT coalesce(sum(octet_length(ph.bytes)),0)');
 source:=replace(source,'>262144000 THEN RAISE EXCEPTION ''PHOTO_LIMIT''; END IF;', E'>262144000 THEN RAISE EXCEPTION ''PHOTO_LIMIT''; END IF;\n PERFORM set_config(''iharu.group_scope'',memo_scope,true);');
 IF position('memo_scope:=current_setting' in source)=0 OR position(''',memo_scope,true)' in source)=0 THEN RAISE EXCEPTION 'MEMO_QUOTA_SCHEMA_CHANGED'; END IF;
 EXECUTE source;
END $$;
-- Notifications must use the record's group, never merely any shared membership.
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.workspace_menu_capture()'::regprocedure);
 IF position('app_private.workspace_can_read(p.id,NEW.owner_id)' in source)=0 THEN RAISE EXCEPTION 'MENU_SCOPE_SCHEMA_CHANGED'; END IF;
 EXECUTE replace(source,'app_private.workspace_can_read(p.id,NEW.owner_id)','app_private.workspace_item_visible(p.id,NEW)');
 source:=pg_get_functiondef('app_private.workspace_push_capture()'::regprocedure);
 IF position('WHERE s.profile_id<>NEW.owner_id' in source)=0 THEN RAISE EXCEPTION 'PUSH_CAPTURE_SCHEMA_CHANGED'; END IF;
 EXECUTE replace(source,'WHERE s.profile_id<>NEW.owner_id','WHERE r.family_id=NEW.space_id AND s.profile_id<>NEW.owner_id');
 source:=pg_get_functiondef('app_private.workspace_push_valid(app_private.workspace_push_outbox,app_private.workspace_push_subscriptions)'::regprocedure);
 IF position('app_private.workspace_can_read(s.profile_id,i.owner_id)' in source)=0 THEN RAISE EXCEPTION 'PUSH_VALID_SCHEMA_CHANGED'; END IF;
 EXECUTE replace(source,'app_private.workspace_can_read(s.profile_id,i.owner_id)','app_private.workspace_item_visible(s.profile_id,i)');
 source:=pg_get_functiondef('app_private.workspace_push_worker(text,text,jsonb)'::regprocedure);
 IF position('app_private.workspace_can_read(s.profile_id,i.owner_id)' in source)=0 OR position('r.profile_id=s.profile_id AND r.active' in source)=0 THEN RAISE EXCEPTION 'PUSH_WORKER_SCHEMA_CHANGED'; END IF;
 source:=replace(source,'app_private.workspace_can_read(s.profile_id,i.owner_id)','app_private.workspace_item_visible(s.profile_id,i)');
 EXECUTE replace(source,'r.profile_id=s.profile_id AND r.active','r.profile_id=s.profile_id AND r.active AND r.family_id=i.space_id');
END $$;
-- Personalized briefing may use the viewer's own schedules and the
-- existing consented child data only when the record belongs to their group.
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.briefing_context(uuid,date)'::regprocedure);
 IF position('app_private.briefing_can_use(who,i.owner_id)' in source)>0 THEN
  EXECUTE replace(source,'app_private.briefing_can_use(who,i.owner_id)',
   'app_private.briefing_can_use(who,i.owner_id) AND app_private.workspace_item_visible(who,i)');
 ELSIF position('workspace_items' in source)>0 THEN
  RAISE EXCEPTION 'BRIEFING_SCOPE_SCHEMA_CHANGED';
 END IF;
END $$;
-- Keep profile initialization off the normal read path. Repeated upserts
-- otherwise hold a write lock on the author before shared indexes and chat rooms.
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('app_private.workspace_command_v76(text,jsonb)'::regprocedure);
 IF position('IF app_private.account_verified() THEN' in source)=0 THEN RAISE EXCEPTION 'WORKSPACE_PROFILE_SCHEMA_CHANGED'; END IF;
 EXECUTE replace(source,'IF app_private.account_verified() THEN',
 'IF app_private.account_verified() AND NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles p JOIN iharu_auth.members m ON m.id=p.member_id JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE p.member_id=actor AND p.name=left(u.name,40)) THEN');
END $$;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_before_multi_groups;
REVOKE ALL ON FUNCTION app_private.workspace_command_before_multi_groups(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; actor uuid:=app_private.actor(); groups jsonb; result jsonb; prefs jsonb; selected uuid; requested text:=nullif(current_setting('iharu.request_group',true),'');
 f app_private.workspace_families%ROWTYPE; invitation app_private.workspace_invites%ROWTYPE; link app_private.workspace_links%ROWTYPE;
 target uuid; legacy uuid; publication uuid; key text; targets uuid[]; scope text; group_name text;
BEGIN
 -- Explicit group operations serialize against invitation rotation and membership/host changes.
 IF (op LIKE 'workspace.group.%' AND op<>'workspace.group.list') OR op IN ('workspace.invite.link.issue','workspace.invite.link.accept','workspace.invite.link.revoke','workspace.family.leave','workspace.family.remove','workspace.invite.issue','workspace.family.join','workspace.invite.link.signup','workspace.child.signup') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-group-transition',20261114));
 ELSE
  -- Group access may run concurrently while memberships remain stable.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('workspace-group-transition',20261114));
 END IF;
 PERFORM set_config('iharu.group_scope','',true);
 IF op='workspace.invite.link.inspect' THEN RETURN app_private.workspace_command_before_multi_groups(op,p); END IF;
 IF NOT app_private.account_verified() AND app_private.workspace_actor() IS NULL THEN RETURN app_private.workspace_command_before_multi_groups(op,p); END IF;
 identity:=app_private.workspace_command_before_multi_groups('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT selected_group_id INTO selected FROM app_private.workspace_profiles WHERE id=who;
 -- Old child-only fixture accounts retain their one original space; current email accounts have explicit personal space.
 IF identity->>'role'='CHILD' AND selected IS NULL THEN SELECT family_id INTO selected FROM app_private.workspace_links WHERE profile_id=who AND active ORDER BY joined_at LIMIT 1; END IF;
 IF op='workspace.group.create' THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  group_name:=coalesce(nullif(btrim(p->>'name'),''),'기본그룹');
  IF length(group_name)>40 OR length(coalesce(p->>'description',''))>240 OR (p->>'color')::int NOT BETWEEN 0 AND 5 OR p->>'clientRequestId' IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO f FROM app_private.workspace_families WHERE created_by=who AND create_key=(p->>'clientRequestId')::uuid;
  IF NOT FOUND THEN
   IF (SELECT count(*) FROM app_private.workspace_links WHERE profile_id=who AND active)>=20 THEN RAISE EXCEPTION 'GROUP_LIMIT'; END IF;
   INSERT INTO app.families(name,owner_id) VALUES(group_name,actor) RETURNING id INTO legacy;
   INSERT INTO app.memberships(family_id,member_id,status) VALUES(legacy,actor,'ACTIVE');
   INSERT INTO app_private.workspace_families(host_id,legacy_family_id,name,description,color,created_by,create_key) VALUES(who,legacy,group_name,coalesce(p->>'description',''),coalesce((p->>'color')::int,0),who,(p->>'clientRequestId')::uuid) RETURNING * INTO f;
   INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(f.id,who);
   INSERT INTO app_private.parent_declarations(member_id,policy_version) VALUES(actor,'parent-invite-2') ON CONFLICT DO NOTHING;
   UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
  ELSIF f.archived_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=who AND active) OR f.name<>group_name OR f.description<>coalesce(p->>'description','') OR f.color<>coalesce((p->>'color')::int,0) THEN
   RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;
  UPDATE app_private.workspace_profiles SET selected_group_id=f.id WHERE id=who;
  RETURN jsonb_build_object('group',app_private.workspace_group_json(f.id,who));
 END IF;
 IF op IN ('workspace.group.update','workspace.group.transfer','workspace.group.archive','workspace.family.leave','workspace.family.remove') THEN
  SELECT * INTO f FROM app_private.workspace_families WHERE id=coalesce(p->>'groupId',p->>'familyId')::uuid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=who AND active) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op<>'workspace.family.leave' AND f.host_id<>who THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
  IF op LIKE 'workspace.group.%' AND f.version IS DISTINCT FROM (p->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF op='workspace.group.update' THEN
   IF length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 40 OR length(coalesce(p->>'description',''))>240 OR (p->>'color')::int NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.workspace_families SET name=btrim(p->>'name'),description=p->>'description',color=(p->>'color')::int,version=version+1 WHERE id=f.id;
   UPDATE app.families SET name=btrim(p->>'name') WHERE id=f.legacy_family_id;
  ELSIF op='workspace.group.transfer' THEN
   target:=(p->>'profileId')::uuid;
   IF target=who OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links l JOIN app_private.workspace_profiles pp ON pp.id=l.profile_id WHERE l.family_id=f.id AND l.profile_id=target AND l.active AND pp.kind='PARENT') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.workspace_families SET host_id=target,version=version+1,epoch=epoch+1 WHERE id=f.id;
   UPDATE app.families SET owner_id=(SELECT member_id FROM app_private.workspace_profiles WHERE id=target) WHERE id=f.legacy_family_id;
   DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND link_kind='PARENT';
  ELSE
   IF op='workspace.group.archive' THEN
    UPDATE app_private.workspace_links SET active=false,version=version+1 WHERE family_id=f.id AND active;
    UPDATE app_private.workspace_families SET archived_at=now(),version=version+1,epoch=epoch+1 WHERE id=f.id;
    UPDATE app.families SET status='CLOSED' WHERE id=f.legacy_family_id;
    UPDATE app.memberships SET status='REVOKED',version=version+1 WHERE family_id=f.legacy_family_id;
    DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND link_kind='PARENT';
    -- Preserve each author's records privately; conversation histories remain in the closed group.
    UPDATE app_private.workspace_items SET space_id=NULL WHERE space_id=f.id AND kind<>'CHAT';
    UPDATE app_private.workspace_memos SET space_id=NULL,data=jsonb_set(data,'{visibility}','"PRIVATE"') WHERE space_id=f.id;
    UPDATE app_private.workspace_profiles SET selected_group_id=NULL WHERE selected_group_id=f.id;
   ELSE
    target:=CASE WHEN op='workspace.family.leave' THEN who ELSE (p->>'profileId')::uuid END;
    IF op='workspace.family.remove' AND target=who THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    SELECT * INTO link FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=target AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF link.version IS DISTINCT FROM (p->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
    PERFORM app_private.workspace_detach_member(f.id,target);
    UPDATE app_private.workspace_families SET version=version+1,archived_at=CASE WHEN NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND active) THEN now() ELSE NULL END WHERE id=f.id;
    UPDATE app_private.workspace_items SET space_id=NULL WHERE space_id=f.id AND owner_id=target AND kind<>'CHAT';
    UPDATE app_private.workspace_memos SET space_id=NULL,data=jsonb_set(data,'{visibility}','"PRIVATE"') WHERE space_id=f.id AND owner_id=target;
    UPDATE app_private.workspace_profiles SET selected_group_id=NULL WHERE id=target AND selected_group_id=f.id;
   END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF op='workspace.invite.link.accept' THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  SELECT * INTO invitation FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' AND id=(p->>'inviteId')::uuid AND link_kind='PARENT';
  IF NOT FOUND OR invitation.expires_at<=now() OR invitation.revoked_at IS NOT NULL OR invitation.used_by IS NOT NULL THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  SELECT * INTO f FROM app_private.workspace_families WHERE id=invitation.family_id AND epoch=invitation.family_epoch AND archived_at IS NULL;
  IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM app_private.workspace_links l JOIN app_private.workspace_profiles pp ON pp.id=l.profile_id
   JOIN iharu_auth.members m ON m.id=pp.member_id
   WHERE l.family_id=f.id AND l.profile_id=f.host_id AND l.active AND m.status='ACTIVE'
   AND NOT EXISTS(SELECT 1 FROM app_private.system_member_controls c WHERE c.target_id=m.id AND c.suspended)
  ) THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=actor AND publication_id=publication AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=who AND active) THEN
   IF (SELECT count(*) FROM app_private.workspace_links WHERE profile_id=who AND active)>=20 THEN RAISE EXCEPTION 'GROUP_LIMIT'; END IF;
   IF (SELECT count(*) FROM app_private.workspace_links WHERE family_id=f.id AND active)>=100 THEN RAISE EXCEPTION 'GROUP_MEMBER_LIMIT'; END IF;
   INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(f.id,who) ON CONFLICT(family_id,profile_id) DO UPDATE SET active=true,version=app_private.workspace_links.version+1,joined_at=now();
   INSERT INTO app.memberships(family_id,member_id,status) VALUES(f.legacy_family_id,actor,'ACTIVE') ON CONFLICT(family_id,member_id) DO UPDATE SET status='ACTIVE',version=app.memberships.version+1;
   UPDATE app_private.workspace_families SET version=version+1 WHERE id=f.id;
  END IF;
  UPDATE app_private.workspace_profiles SET selected_group_id=f.id WHERE id=who;
  RETURN jsonb_build_object('ok',true,'familyName',f.name,'groupId',f.id);
 END IF;
 IF op IN ('workspace.invite.link.issue','workspace.invite.link.options','workspace.invite.link.revoke') AND coalesce(p->>'kind','PARENT')='PARENT' THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  selected:=coalesce((p->>'groupId')::uuid,CASE WHEN requested IS NOT NULL THEN nullif(requested,'personal')::uuid ELSE selected END);
  IF selected IS NULL AND op='workspace.invite.link.issue' THEN
   IF EXISTS(SELECT 1 FROM app_private.workspace_links WHERE profile_id=who AND active) THEN RAISE EXCEPTION 'GROUP_SELECTION_REQUIRED'; END IF;
   result:=app_private.workspace_command('workspace.group.create',jsonb_build_object('name','기본그룹','color',0,'description','','clientRequestId',gen_random_uuid()));selected:=(result->'group'->>'id')::uuid;
  END IF;
  SELECT * INTO f FROM app_private.workspace_families WHERE id=selected AND archived_at IS NULL;
  IF selected IS NOT NULL AND (f.id IS NULL OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=who AND active)) THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  IF op='workspace.invite.link.options' THEN
   RETURN (CASE WHEN f.id IS NULL OR f.host_id=who THEN app_private.workspace_command_before_multi_groups(op,'{}') ELSE jsonb_build_object('childRegistrationReady',false,'children','[]'::jsonb) END)||jsonb_build_object('pending',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',link_kind,'expiresAt',expires_at)) FROM app_private.workspace_invites WHERE family_id=f.id AND link_kind='PARENT' AND expires_at>now() AND revoked_at IS NULL AND used_by IS NULL),'[]'::jsonb));
  ELSIF op='workspace.invite.link.revoke' THEN
   DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND id=(p->>'inviteId')::uuid AND link_kind='PARENT';RETURN jsonb_build_object('ok',true);
  END IF;
  IF p->>'consent' IS DISTINCT FROM 'true' OR coalesce(p->>'codeHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF NOT EXISTS(
   SELECT 1 FROM app_private.workspace_links l JOIN app_private.workspace_profiles pp ON pp.id=l.profile_id
   JOIN iharu_auth.members m ON m.id=pp.member_id
   WHERE l.family_id=f.id AND l.profile_id=f.host_id AND l.active AND m.status='ACTIVE'
   AND NOT EXISTS(SELECT 1 FROM app_private.system_member_controls c WHERE c.target_id=m.id AND c.suspended)
  ) THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=actor AND publication_id=publication AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND link_kind='PARENT';
  INSERT INTO app_private.workspace_invites(family_id,host_id,family_epoch,code_hash,link_kind,expires_at) VALUES(f.id,f.host_id,f.epoch,p->>'codeHash','PARENT',now()+interval '24 hours') RETURNING * INTO invitation;
  RETURN jsonb_build_object('id',invitation.id,'kind','PARENT','expiresAt',invitation.expires_at,'groupId',f.id,'familyName',f.name);
 END IF;
 IF op='workspace.group.select' THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  selected:=(p->>'groupId')::uuid;requested:=coalesce(selected::text,'personal');
 END IF;
 IF requested IS NOT NULL THEN selected:=nullif(requested,'personal')::uuid; END IF;
 IF selected IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.workspace_links l JOIN app_private.workspace_families g ON g.id=l.family_id WHERE l.profile_id=who AND l.family_id=selected AND l.active AND g.archived_at IS NULL) THEN
  IF requested IS NOT NULL THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  selected:=NULL;UPDATE app_private.workspace_profiles SET selected_group_id=NULL WHERE id=who;
 END IF;
 IF op='workspace.group.select' THEN UPDATE app_private.workspace_profiles SET selected_group_id=selected WHERE id=who; END IF;
 IF op IN ('workspace.me','workspace.group.list') THEN
 SELECT coalesce(jsonb_agg(app_private.workspace_group_json(g.id,who) ORDER BY g.created_at,g.id),'[]'::jsonb) INTO groups FROM app_private.workspace_families g JOIN app_private.workspace_links l ON l.family_id=g.id WHERE l.profile_id=who AND l.active AND g.archived_at IS NULL;
 END IF;
 IF op='workspace.group.list' THEN RETURN jsonb_build_object('groups',groups,'selectedGroupId',selected); END IF;
 -- Take the room's family lock before the legacy profile lookups can acquire
 -- row locks. This also serializes sends and leaves with room membership.
 IF selected IS NOT NULL THEN
  IF op IN ('workspace.chat.room.create','workspace.chat.room.leave') THEN
   PERFORM id FROM app_private.workspace_families WHERE id=selected FOR UPDATE;
  ELSIF op='workspace.chat.send' AND p?'roomId' THEN
   PERFORM id FROM app_private.workspace_families WHERE id=selected FOR SHARE;
  END IF;
 END IF;
 key:=coalesce(selected::text,'personal');PERFORM set_config('iharu.group_scope',key,true);
 IF op='workspace.group.select' THEN RETURN jsonb_build_object('selectedGroupId',selected); END IF;
 IF op IN ('workspace.invite.issue','workspace.family.join') OR (op='workspace.invite.link.issue' AND p->>'kind'='CHILD') THEN PERFORM set_config('iharu.group_scope','',true); END IF;
 result:=app_private.workspace_command_before_multi_groups(op,p);
 -- Compatibility for retired numeric-code fixtures; no personal records are copied to a group.
 IF op IN ('workspace.invite.issue','workspace.family.join') OR (op='workspace.invite.link.issue' AND p->>'kind'='CHILD') THEN
  PERFORM set_config('iharu.group_scope','',true);
  SELECT family_id INTO selected FROM app_private.workspace_links WHERE profile_id=who AND active ORDER BY joined_at DESC LIMIT 1;
  UPDATE app_private.workspace_profiles SET selected_group_id=selected WHERE id=who;
  UPDATE app_private.workspace_items i SET space_id=NULL WHERE owner_id=who AND space_id IS NOT NULL AND kind<>'CHAT' AND NOT EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.profile_id=who AND l.family_id=i.space_id AND l.active);
 END IF;
 IF op IN ('workspace.member-filter.preference.save','workspace.timetable.preference.save') THEN
  scope:=coalesce(p->>'scope','timetable');
  UPDATE app_private.workspace_profiles SET group_filter_preferences=jsonb_set(group_filter_preferences,ARRAY[key],coalesce(group_filter_preferences->key,'{}')||jsonb_build_object(scope,result->'memberIds'),true) WHERE id=who;
 END IF;
 IF op='workspace.me' THEN
  SELECT coalesce(group_filter_preferences->key,'{}'::jsonb) INTO prefs FROM app_private.workspace_profiles WHERE id=who;
  FOREACH scope IN ARRAY CASE WHEN identity->>'role'='CHILD' THEN ARRAY['timetable','calendar','home'] ELSE ARRAY['timetable','calendar','fees','home','homeFees'] END LOOP
   SELECT array_agg(v.value::uuid ORDER BY v.ord) INTO targets FROM jsonb_array_elements_text(coalesce(prefs->scope,'[]')) WITH ORDINALITY v(value,ord) WHERE app_private.workspace_can_read(who,v.value::uuid);
   prefs:=prefs||jsonb_build_object(scope,coalesce(targets,ARRAY[who]));
  END LOOP;
  RETURN result||jsonb_build_object('groups',groups,'selectedGroupId',selected,'family',CASE WHEN selected IS NULL THEN NULL ELSE app_private.workspace_group_json(selected,who) END,'memberFilterPreferences',prefs,'timetableMemberIds',prefs->'timetable','timetableMemberId',CASE WHEN jsonb_array_length(prefs->'timetable')=1 THEN prefs->'timetable'->0 ELSE NULL END);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_space_on_insert(),app_private.workspace_memo_space(),app_private.workspace_item_visible(uuid,app_private.workspace_items),app_private.workspace_group_json(uuid,uuid),app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
