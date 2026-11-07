-- UI76: account-owned data, parent-host invitations, shared read / author-only write.
ALTER TABLE app_private.child_accounts DROP CONSTRAINT child_accounts_login_id_check;
ALTER TABLE app_private.child_accounts ADD CONSTRAINT child_accounts_login_id_check CHECK(login_id ~ '^[a-z0-9][a-z0-9_]{3,19}$');
CREATE TABLE app_private.workspace_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid UNIQUE REFERENCES iharu_auth.members(id),
 child_account_id uuid UNIQUE REFERENCES app_private.child_accounts(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
 kind text NOT NULL CHECK(kind IN ('PARENT','CHILD')), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='PARENT' AND member_id IS NOT NULL AND child_account_id IS NULL) OR (kind='CHILD' AND member_id IS NULL AND child_account_id IS NOT NULL))
);
CREATE TABLE app_private.workspace_families (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host_id uuid UNIQUE NOT NULL REFERENCES app_private.workspace_profiles(id),
 legacy_family_id uuid NOT NULL REFERENCES app.families(id), name text NOT NULL, epoch integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.workspace_links (
 family_id uuid NOT NULL REFERENCES app_private.workspace_families(id), profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(family_id,profile_id)
);
CREATE UNIQUE INDEX workspace_one_family ON app_private.workspace_links(profile_id) WHERE active;
CREATE INDEX workspace_family_members ON app_private.workspace_links(family_id) WHERE active;
CREATE TABLE app_private.workspace_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL REFERENCES app_private.workspace_families(id),
 host_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id), family_epoch integer NOT NULL, code_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', used_by uuid REFERENCES app_private.workspace_profiles(id), revoked_at timestamptz
);
CREATE TABLE app_private.workspace_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id), token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE app_private.workspace_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id),
 kind text NOT NULL CHECK(kind IN ('EVENT','REPEAT','FEE','NOTE','CHAT')), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX workspace_items_owner ON app_private.workspace_items(owner_id,kind) WHERE deleted_at IS NULL;
CREATE INDEX workspace_items_date ON app_private.workspace_items((data->>'date')) WHERE deleted_at IS NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_profiles','workspace_families','workspace_links','workspace_invites','workspace_sessions','workspace_items'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY workspace_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.id FROM app_private.workspace_profiles p WHERE
 (p.member_id=app_private.actor() AND app_private.account_verified()) OR
 (p.kind='CHILD' AND EXISTS(SELECT 1 FROM app_private.workspace_sessions s WHERE s.profile_id=p.id AND s.token_hash=nullif(current_setting('iharu.workspace_hash',true),'') AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '7 days')) LIMIT 1
$$;
CREATE FUNCTION app_private.workspace_can_read(viewer uuid,author uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT viewer=author OR EXISTS(SELECT 1 FROM app_private.workspace_links a JOIN app_private.workspace_links b ON b.family_id=a.family_id AND b.active WHERE a.profile_id=viewer AND a.active AND b.profile_id=author)
$$;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE who uuid; actor uuid:=app_private.actor(); profile app_private.workspace_profiles%ROWTYPE; host app_private.workspace_profiles%ROWTYPE;
 fam app_private.workspace_families%ROWTYPE; inv app_private.workspace_invites%ROWTYPE; account app_private.child_accounts%ROWTYPE;
 item app_private.workspace_items%ROWTYPE; link app_private.workspace_links%ROWTYPE; ch app.children%ROWTYPE;
 fid uuid; cid uuid; result jsonb; people jsonb; target uuid; family_name text; legacy_device boolean:=false;
BEGIN
 IF op='workspace.credentials' THEN
  SELECT * INTO account FROM app_private.child_accounts WHERE login_id=p->>'loginId' AND child_id IS NOT NULL;
  RETURN CASE WHEN FOUND THEN jsonb_build_object('passwordHash',account.password_hash) ELSE '{}'::jsonb END;
 END IF;
 IF op IN ('workspace.child.signup','workspace.child.login') THEN
  IF (p->>'tokenHash') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF op='workspace.child.signup' THEN
   SELECT * INTO inv FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' FOR UPDATE;
   IF NOT FOUND OR inv.used_by IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at<=now() THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
   SELECT * INTO host FROM app_private.workspace_profiles WHERE id=inv.host_id AND kind='PARENT';
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE profile_id=host.id AND family_id=inv.family_id AND active) OR NOT EXISTS(SELECT 1 FROM iharu_auth.members WHERE id=host.member_id AND status='ACTIVE') THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
   SELECT * INTO fam FROM app_private.workspace_families WHERE id=inv.family_id FOR UPDATE;
   IF inv.family_epoch<>fam.epoch OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=fam.id AND profile_id=fam.host_id AND active) THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
   IF (p->>'loginId') !~ '^[a-z0-9][a-z0-9_]{3,19}$' OR length(p->>'name') NOT BETWEEN 1 AND 24 OR length(p->>'passwordHash') NOT BETWEEN 80 AND 220 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF EXISTS(SELECT 1 FROM app_private.child_accounts WHERE login_id=p->>'loginId') THEN RAISE EXCEPTION 'ID_TAKEN'; END IF;
   INSERT INTO app.children(family_id,nickname,consenter_id) VALUES(fam.legacy_family_id,p->>'name',host.member_id) RETURNING * INTO ch;
   INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(fam.legacy_family_id,ch.id,'general',host.member_id,'parent-invite-2','workspace-invite:'||inv.id::text);
   INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,tuition_read,tuition_write,approved_by) VALUES(fam.legacy_family_id,ch.id,host.member_id,true,true,true,true,host.member_id);
   INSERT INTO app.rooms(family_id,child_id) VALUES(fam.legacy_family_id,ch.id);
   INSERT INTO app_private.child_accounts(login_id,name,password_hash,proof_hash,code_hash,child_id,approved_by,approved_at) VALUES(p->>'loginId',p->>'name',p->>'passwordHash',p->>'proofHash',p->>'unusedCodeHash',ch.id,host.member_id,now()) RETURNING * INTO account;
   INSERT INTO app_private.workspace_profiles(child_account_id,name,kind) VALUES(account.id,account.name,'CHILD') RETURNING * INTO profile;
   INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(fam.id,profile.id);
   UPDATE app_private.workspace_invites SET used_by=profile.id WHERE id=inv.id;
  ELSE
   SELECT * INTO account FROM app_private.child_accounts WHERE login_id=p->>'loginId' AND password_hash=p->>'passwordHash' AND child_id IS NOT NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'LOGIN_INVALID'; END IF;
   INSERT INTO app_private.workspace_profiles(child_account_id,name,kind) VALUES(account.id,account.name,'CHILD') ON CONFLICT(child_account_id) DO UPDATE SET name=excluded.name RETURNING * INTO profile;
   -- A removed child still owns the account and personal records. Family membership is independent.
   SELECT * INTO ch FROM app.children WHERE id=account.child_id AND status='ACTIVE';
  END IF;
  INSERT INTO app_private.workspace_sessions(profile_id,token_hash) VALUES(profile.id,p->>'tokenHash');
  IF ch.id IS NOT NULL AND ch.status='ACTIVE' AND EXISTS(SELECT 1 FROM app.child_consents WHERE child_id=ch.id AND purpose='general' AND revoked_at IS NULL) AND (SELECT count(*) FROM app.child_devices WHERE child_id=ch.id AND status='ACTIVE' AND expires_at>now())<2 THEN
   INSERT INTO app.child_devices(family_id,child_id,label,token_hash) VALUES(ch.family_id,ch.id,'자녀 개인 로그인',p->>'deviceHash');legacy_device:=true;
  END IF;
  RETURN jsonb_build_object('status','CONNECTED','name',profile.name,'loginId',account.login_id,'legacyDevice',legacy_device);
 END IF;
 IF app_private.account_verified() THEN
  INSERT INTO app_private.workspace_profiles(member_id,name,kind) SELECT actor,left(u.name,40),'PARENT' FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE m.id=actor ON CONFLICT(member_id) DO UPDATE SET name=excluded.name;
 END IF;
 who:=app_private.workspace_actor();
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT * INTO profile FROM app_private.workspace_profiles WHERE id=who;
 UPDATE app_private.workspace_sessions SET last_seen_at=now() WHERE token_hash=nullif(current_setting('iharu.workspace_hash',true),'') AND profile_id=who AND revoked_at IS NULL;
 IF op='workspace.me' THEN
  SELECT f.* INTO fam FROM app_private.workspace_links l JOIN app_private.workspace_families f ON f.id=l.family_id WHERE l.profile_id=who AND l.active;
  IF fam.id IS NOT NULL THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'kind',pp.kind,'host',pp.id=fam.host_id,'version',ll.version) ORDER BY ll.joined_at),'[]'::jsonb) INTO people FROM app_private.workspace_links ll JOIN app_private.workspace_profiles pp ON pp.id=ll.profile_id WHERE ll.family_id=fam.id AND ll.active; END IF;
  RETURN jsonb_build_object('id',who,'name',profile.name,'role',profile.kind,'loginId',(SELECT login_id FROM app_private.child_accounts WHERE id=profile.child_account_id),'family',CASE WHEN fam.id IS NOT NULL THEN jsonb_build_object('id',fam.id,'name',fam.name,'hostId',fam.host_id,'isHost',fam.host_id=who,'members',people) ELSE NULL END);
 ELSIF op='workspace.logout' THEN
  UPDATE app_private.workspace_sessions SET revoked_at=now() WHERE profile_id=who AND token_hash=nullif(current_setting('iharu.workspace_hash',true),'');RETURN jsonb_build_object('ok',true);
 ELSIF op='workspace.invite.issue' THEN
  IF profile.kind<>'PARENT' OR coalesce((p->>'consent')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,76));
  PERFORM id FROM app_private.workspace_invites WHERE host_id=who AND used_by IS NULL AND revoked_at IS NULL FOR UPDATE;
  SELECT * INTO link FROM app_private.workspace_links WHERE profile_id=who AND active;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM app_private.workspace_families WHERE id=link.family_id AND host_id=who) THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
  SELECT * INTO fam FROM app_private.workspace_families WHERE host_id=who FOR UPDATE;
  IF NOT FOUND THEN
   SELECT id INTO fid FROM app.families WHERE owner_id=actor AND status='ACTIVE' ORDER BY created_at LIMIT 1;
   IF fid IS NULL THEN INSERT INTO app.families(name,owner_id) VALUES(left(profile.name,30)||'의 가족',actor) RETURNING id INTO fid;INSERT INTO app.memberships(family_id,member_id,status) VALUES(fid,actor,'ACTIVE');END IF;
   INSERT INTO app_private.workspace_families(host_id,legacy_family_id,name) VALUES(who,fid,left(profile.name,30)||'의 가족') RETURNING * INTO fam;
  END IF;
  INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(fam.id,who) ON CONFLICT(family_id,profile_id) DO UPDATE SET active=true,version=app_private.workspace_links.version+1;
  INSERT INTO app_private.parent_declarations(member_id,policy_version) VALUES(actor,'parent-invite-2') ON CONFLICT DO NOTHING;
  UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
  UPDATE app_private.workspace_invites SET revoked_at=now() WHERE host_id=who AND used_by IS NULL AND revoked_at IS NULL;
  INSERT INTO app_private.workspace_invites(family_id,host_id,family_epoch,code_hash) VALUES(fam.id,who,fam.epoch,p->>'codeHash') RETURNING * INTO inv;
  RETURN jsonb_build_object('expiresAt',inv.expires_at,'familyName',fam.name);
 ELSIF op='workspace.family.join' THEN
  SELECT * INTO inv FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' FOR UPDATE;
  IF NOT FOUND OR inv.used_by IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at<=now() THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,76));
  SELECT * INTO fam FROM app_private.workspace_families WHERE id=inv.family_id FOR UPDATE;
   IF inv.family_epoch<>fam.epoch OR NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=fam.id AND profile_id=fam.host_id AND active) THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  IF fam.host_id=who THEN RAISE EXCEPTION 'OWN_CODE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=fam.id AND profile_id=fam.host_id AND active) THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM app_private.workspace_links WHERE profile_id=who AND active) THEN RAISE EXCEPTION 'ALREADY_LINKED'; END IF;
  INSERT INTO app_private.workspace_links(family_id,profile_id) VALUES(fam.id,who) ON CONFLICT(family_id,profile_id) DO UPDATE SET active=true,version=app_private.workspace_links.version+1,joined_at=now();
  UPDATE app_private.workspace_invites SET used_by=who WHERE id=inv.id;
  RETURN jsonb_build_object('ok',true,'familyName',fam.name);
 ELSIF op IN ('workspace.family.remove','workspace.family.leave') THEN
  SELECT * INTO fam FROM app_private.workspace_families WHERE id=(p->>'familyId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op='workspace.family.remove' AND fam.host_id<>who THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
  target:=CASE WHEN op='workspace.family.leave' THEN who ELSE (p->>'profileId')::uuid END;
  IF target=fam.host_id AND EXISTS(SELECT 1 FROM app_private.workspace_links WHERE family_id=fam.id AND profile_id<>who AND active) THEN RAISE EXCEPTION 'HOST_HAS_MEMBERS'; END IF;
  IF op='workspace.family.remove' AND target=who THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO link FROM app_private.workspace_links WHERE family_id=fam.id AND profile_id=target AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF link.version<>(p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  UPDATE app_private.workspace_links SET active=false,version=version+1 WHERE family_id=fam.id AND profile_id=target;
  UPDATE app_private.workspace_families SET epoch=epoch+1 WHERE id=fam.id;
  UPDATE app.memberships SET status='REVOKED',version=version+1 WHERE family_id=fam.legacy_family_id AND member_id=(SELECT member_id FROM app_private.workspace_profiles WHERE id=target) AND member_id<>(SELECT member_id FROM app_private.workspace_profiles WHERE id=fam.host_id);
  UPDATE app.child_grants SET daily=false,chat=false,location=false,tuition_read=false,tuition_write=false,version=version+1 WHERE family_id=fam.legacy_family_id AND member_id=(SELECT member_id FROM app_private.workspace_profiles WHERE id=target);
  -- Disconnect old child-only tools as well; keep the independent account/session and authored items.
  SELECT ca.child_id INTO cid FROM app_private.workspace_profiles pp JOIN app_private.child_accounts ca ON ca.id=pp.child_account_id WHERE pp.id=target;
  IF cid IS NOT NULL THEN
   UPDATE app.child_grants SET daily=false,chat=false,location=false,tuition_read=false,tuition_write=false,version=version+1 WHERE child_id=cid;
   UPDATE app.child_consents SET revoked_at=now() WHERE child_id=cid AND revoked_at IS NULL;
   UPDATE app.children SET status='REVOKED',version=version+1 WHERE id=cid;
   UPDATE app.child_devices SET status='REVOKED',session_epoch=session_epoch+1 WHERE child_id=cid;
  END IF;
  RETURN jsonb_build_object('ok',true);
 ELSIF op='workspace.items.list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'data',i.data,'ownerId',i.owner_id,'ownerName',pp.name,'mine',i.owner_id=who,'version',i.version) ORDER BY i.data->>'date',i.created_at),'[]'::jsonb) INTO result
  FROM app_private.workspace_items i JOIN app_private.workspace_profiles pp ON pp.id=i.owner_id WHERE i.deleted_at IS NULL AND app_private.workspace_can_read(who,i.owner_id)
   AND (nullif(p->>'kind','') IS NULL OR i.kind=p->>'kind')
   AND (i.data->>'date')<=p->>'to' AND (CASE WHEN i.kind='REPEAT' THEN i.data->>'untilDate' ELSE i.data->>'date' END)>=p->>'from';
  RETURN jsonb_build_object('items',result);
 ELSIF op='workspace.items.get' THEN
  SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'id')::uuid AND deleted_at IS NULL;
  IF NOT FOUND OR NOT app_private.workspace_can_read(who,item.owner_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN jsonb_build_object('id',item.id,'kind',item.kind,'data',item.data,'ownerId',item.owner_id,'ownerName',(SELECT name FROM app_private.workspace_profiles WHERE id=item.owner_id),'mine',item.owner_id=who,'version',item.version);
 ELSIF op IN ('workspace.items.create','workspace.items.update','workspace.items.delete') THEN
  IF op<>'workspace.items.create' THEN
   SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'id')::uuid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF item.owner_id<>who THEN RAISE EXCEPTION 'AUTHOR_ONLY'; END IF;
   IF item.version<>(p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  END IF;
  IF op='workspace.items.delete' THEN UPDATE app_private.workspace_items SET deleted_at=now(),version=version+1 WHERE id=item.id;RETURN jsonb_build_object('ok',true);END IF;
  IF length(p->'data'->>'title') NOT BETWEEN 1 AND 80 OR coalesce(p->'data'->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF op='workspace.items.create' THEN
   INSERT INTO app_private.workspace_items(owner_id,kind,data) VALUES(who,p->>'kind',p->'data') RETURNING * INTO item;
  ELSE
   IF item.kind<>p->>'kind' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.workspace_items SET data=p->'data',version=version+1,updated_at=now() WHERE id=item.id RETURNING * INTO item;
  END IF;
  RETURN jsonb_build_object('id',item.id,'version',item.version);
 END IF;
 RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_actor(),app_private.workspace_can_read(uuid,uuid),app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
