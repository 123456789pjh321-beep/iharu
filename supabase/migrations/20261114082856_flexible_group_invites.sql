-- One replaceable group link; membership transitions preserve account-owned records.
-- Dormant groups must not prevent an account from hosting another group later.
ALTER TABLE app_private.workspace_families DROP CONSTRAINT workspace_families_host_id_key;
CREATE INDEX workspace_families_host ON app_private.workspace_families(host_id);
-- Before this release expires_at = issuance + 24h for every PARENT link.
DELETE FROM app_private.workspace_invites i USING (
 SELECT id,row_number() OVER(PARTITION BY family_id ORDER BY expires_at DESC,id DESC) AS n
 FROM app_private.workspace_invites WHERE link_kind='PARENT'
) ranked WHERE i.id=ranked.id AND ranked.n>1;
CREATE UNIQUE INDEX workspace_one_group_invite ON app_private.workspace_invites(family_id) WHERE link_kind='PARENT';
GRANT DELETE ON app_private.workspace_invites TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_pre_flexible_groups;
REVOKE ALL ON FUNCTION app_private.workspace_command_pre_flexible_groups(text,jsonb) FROM PUBLIC,app_runtime;

-- Internal only. Called after group transition locking and actor/version checks.
CREATE FUNCTION app_private.workspace_detach_member(fid uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE f app_private.workspace_families%ROWTYPE; successor uuid; successor_member uuid; target_member uuid; child uuid;
BEGIN
 SELECT * INTO STRICT f FROM app_private.workspace_families WHERE id=fid FOR UPDATE;
 SELECT member_id INTO target_member FROM app_private.workspace_profiles WHERE id=target;
 UPDATE app_private.workspace_links SET active=false,version=version+1 WHERE family_id=fid AND profile_id=target AND active;
 IF f.host_id=target THEN
  SELECT l.profile_id,p.member_id INTO successor,successor_member FROM app_private.workspace_links l
   JOIN app_private.workspace_profiles p ON p.id=l.profile_id
   LEFT JOIN iharu_auth.members m ON m.id=p.member_id
   WHERE l.family_id=fid AND l.active AND (p.kind='CHILD' OR m.status='ACTIVE')
   ORDER BY (p.kind='PARENT') DESC,l.joined_at,l.profile_id LIMIT 1;
  IF successor IS NOT NULL THEN
   UPDATE app_private.workspace_families SET host_id=successor WHERE id=fid;
   IF successor_member IS NOT NULL THEN
    UPDATE app.families SET owner_id=successor_member WHERE id=f.legacy_family_id;
    INSERT INTO app.memberships(family_id,member_id,status) VALUES(f.legacy_family_id,successor_member,'ACTIVE')
     ON CONFLICT(family_id,member_id) DO UPDATE SET status='ACTIVE',version=app.memberships.version+1;
   END IF;
  ELSE
   UPDATE app.families SET status='CLOSED' WHERE id=f.legacy_family_id;
  END IF;
 END IF;
 UPDATE app_private.workspace_families SET epoch=epoch+1 WHERE id=fid;
 DELETE FROM app_private.workspace_invites WHERE family_id=fid AND link_kind='PARENT';
 UPDATE app.memberships SET status='REVOKED',version=version+1 WHERE family_id=f.legacy_family_id AND member_id=target_member;
 UPDATE app.child_grants SET daily=false,chat=false,location=false,tuition_read=false,tuition_write=false,version=version+1
  WHERE family_id=f.legacy_family_id AND member_id=target_member;
 SELECT ca.child_id INTO child FROM app_private.workspace_profiles p JOIN app_private.child_accounts ca ON ca.id=p.child_account_id WHERE p.id=target;
 IF child IS NOT NULL THEN
  UPDATE app.child_grants SET daily=false,chat=false,location=false,tuition_read=false,tuition_write=false,version=version+1 WHERE child_id=child;
  UPDATE app.child_consents SET revoked_at=now() WHERE child_id=child AND revoked_at IS NULL;
  UPDATE app.children SET status='REVOKED',version=version+1 WHERE id=child;
  UPDATE app.child_devices SET status='REVOKED',session_epoch=session_epoch+1 WHERE child_id=child;
 END IF;
 -- Chat room access and queued push delivery already require an active link AND matching version.
 -- Never copy, delete or reassign workspace_items, budgets or conversation history here.
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_detach_member(uuid,uuid) FROM PUBLIC,app_runtime;

CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; actor uuid:=app_private.actor(); f app_private.workspace_families%ROWTYPE;
 invitation app_private.workspace_invites%ROWTYPE; current_link app_private.workspace_links%ROWTYPE;
 target uuid; legacy uuid; publication uuid; options jsonb;
BEGIN
 -- Membership changes are infrequent and small. One transaction lock also orders cross-group moves
 -- and menu-update triggers, preventing opposing moves/reissues from deadlocking or reviving links.
 IF op IN ('workspace.invite.link.issue','workspace.invite.link.revoke','workspace.invite.link.accept',
  'workspace.family.leave','workspace.family.remove','workspace.invite.issue','workspace.family.join') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-group-transition',20261114));
 END IF;
 IF op IN ('workspace.family.leave','workspace.family.remove') THEN
  identity:=app_private.workspace_command_pre_flexible_groups('workspace.me','{}');who:=(identity->>'id')::uuid;
  SELECT * INTO f FROM app_private.workspace_families WHERE id=(p->>'familyId')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=who AND active) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op='workspace.family.remove' AND f.host_id<>who THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
  target:=CASE WHEN op='workspace.family.leave' THEN who ELSE (p->>'profileId')::uuid END;
  IF op='workspace.family.remove' AND target=who THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO current_link FROM app_private.workspace_links WHERE family_id=f.id AND profile_id=target AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF current_link.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  PERFORM app_private.workspace_detach_member(f.id,target);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF op IN ('workspace.invite.link.options','workspace.invite.link.issue','workspace.invite.link.revoke')
    AND (op<>'workspace.invite.link.issue' OR p->>'kind'='PARENT') THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  identity:=app_private.workspace_command_pre_flexible_groups('workspace.me','{}');who:=(identity->>'id')::uuid;
  SELECT f1.* INTO f FROM app_private.workspace_families f1 JOIN app_private.workspace_links l ON l.family_id=f1.id WHERE l.profile_id=who AND l.active;
  IF op='workspace.invite.link.options' THEN
   options:=CASE WHEN f.id IS NULL OR f.host_id=who THEN app_private.workspace_command_pre_flexible_groups(op,p) ELSE jsonb_build_object('childRegistrationReady',false,'children','[]'::jsonb) END;
   RETURN options||jsonb_build_object('pending',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',i.id,'kind',i.link_kind,'expiresAt',i.expires_at)) FROM app_private.workspace_invites i
    WHERE i.family_id=f.id AND i.link_kind='PARENT' AND i.family_epoch=f.epoch AND i.revoked_at IS NULL AND i.used_by IS NULL AND i.expires_at>now()),'[]'::jsonb));
  END IF;
  IF op='workspace.invite.link.revoke' THEN
   IF EXISTS(SELECT 1 FROM app_private.workspace_invites WHERE id=(p->>'inviteId')::uuid AND link_kind='CHILD') THEN RETURN app_private.workspace_command_pre_flexible_groups(op,p); END IF;
   DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND id=(p->>'inviteId')::uuid AND link_kind='PARENT';
   RETURN jsonb_build_object('ok',true);
  END IF;
  IF p->>'consent' IS DISTINCT FROM 'true' OR coalesce(p->>'codeHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=actor AND publication_id=publication AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  IF f.id IS NULL THEN
   INSERT INTO app.families(name,owner_id) VALUES(left(identity->>'name',30)||'의 그룹',actor) RETURNING id INTO legacy;
   INSERT INTO app.memberships(family_id,member_id,status) VALUES(legacy,actor,'ACTIVE');
   INSERT INTO app_private.workspace_families(host_id,legacy_family_id,name) VALUES(who,legacy,left(identity->>'name',30)||'의 그룹') RETURNING * INTO f;
   INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(f.id,who);
   INSERT INTO app_private.parent_declarations(member_id,policy_version) VALUES(actor,'parent-invite-2') ON CONFLICT DO NOTHING;
   UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
  END IF;
  DELETE FROM app_private.workspace_invites WHERE family_id=f.id AND link_kind='PARENT';
  INSERT INTO app_private.workspace_invites(family_id,host_id,family_epoch,code_hash,link_kind,expires_at)
   VALUES(f.id,f.host_id,f.epoch,p->>'codeHash','PARENT',now()+interval '24 hours') RETURNING * INTO invitation;
  RETURN jsonb_build_object('id',invitation.id,'kind','PARENT','expiresAt',invitation.expires_at);
 END IF;
 IF op IN ('workspace.invite.link.inspect','workspace.invite.link.accept') THEN
  SELECT * INTO invitation FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' AND link_kind='PARENT';
  -- Preserve retired child fixtures and their guardian rules, but never use them for adult acceptance.
  IF NOT FOUND THEN RETURN app_private.workspace_command_pre_flexible_groups(op,p); END IF;
  IF invitation.revoked_at IS NOT NULL OR invitation.used_by IS NOT NULL OR invitation.expires_at<=now()
   OR (op='workspace.invite.link.accept' AND invitation.id IS DISTINCT FROM (p->>'inviteId')::uuid) THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  SELECT f1.* INTO f FROM app_private.workspace_families f1 JOIN app_private.workspace_links l ON l.family_id=f1.id AND l.profile_id=f1.host_id AND l.active
   WHERE f1.id=invitation.family_id AND f1.epoch=invitation.family_epoch
    AND EXISTS(SELECT 1 FROM app_private.workspace_profiles pp LEFT JOIN iharu_auth.members m ON m.id=pp.member_id WHERE pp.id=f1.host_id AND (pp.kind='CHILD' OR m.status='ACTIVE'));
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  IF op='workspace.invite.link.inspect' THEN
   RETURN jsonb_build_object('id',invitation.id,'kind','PARENT','expiresAt',invitation.expires_at,'childSession',actor IS NULL AND app_private.workspace_actor() IS NOT NULL)
    ||CASE WHEN app_private.account_verified() THEN jsonb_build_object('familyId',f.id,'familyName',f.name) ELSE '{}'::jsonb END;
  END IF;
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  identity:=app_private.workspace_command_pre_flexible_groups('workspace.me','{}');who:=(identity->>'id')::uuid;
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=actor AND publication_id=publication AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  SELECT * INTO current_link FROM app_private.workspace_links WHERE profile_id=who AND active FOR UPDATE;
  IF current_link.family_id=f.id THEN RETURN jsonb_build_object('ok',true,'familyName',f.name); END IF;
  IF current_link.family_id IS NOT NULL THEN
   IF p->'leaveCurrent' IS NULL THEN RAISE EXCEPTION 'ALREADY_LINKED'; END IF;
   IF current_link.family_id IS DISTINCT FROM (p->'leaveCurrent'->>'familyId')::uuid OR current_link.version IS DISTINCT FROM (p->'leaveCurrent'->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   PERFORM app_private.workspace_detach_member(current_link.family_id,who);
  ELSIF p->'leaveCurrent' IS NOT NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(f.id,who)
   ON CONFLICT(family_id,profile_id) DO UPDATE SET active=true,version=app_private.workspace_links.version+1,joined_at=now();
  RETURN jsonb_build_object('ok',true,'familyName',f.name);
 END IF;
 RETURN app_private.workspace_command_pre_flexible_groups(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
