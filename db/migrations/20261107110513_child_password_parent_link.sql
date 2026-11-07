-- UI75: child password accounts, approved by a signed-in parent. No deletion capability.
-- Parent approval is a self-declared household link, never third-party identity evidence.
ALTER TABLE app.children ALTER COLUMN birth_date DROP NOT NULL;
CREATE TABLE app_private.child_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), login_id text UNIQUE NOT NULL CHECK(login_id ~ '^i[a-z0-9]{10}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 24), password_hash text NOT NULL,
 proof_hash text UNIQUE NOT NULL, code_hash text UNIQUE NOT NULL,
 code_expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 created_at timestamptz NOT NULL DEFAULT now(), pending_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 finished_device_id uuid REFERENCES app.child_devices(id), sealed_response text,
 child_id uuid UNIQUE REFERENCES app.children(id), approved_by uuid REFERENCES iharu_auth.members(id), approved_at timestamptz,
 CHECK((child_id IS NULL AND approved_by IS NULL AND approved_at IS NULL) OR (child_id IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE app_private.parent_declarations (
 member_id uuid PRIMARY KEY REFERENCES iharu_auth.members(id), declared_at timestamptz NOT NULL DEFAULT now(),
 policy_version text NOT NULL DEFAULT 'parent-link-1'
);
ALTER TABLE app_private.child_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.child_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.parent_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.parent_declarations FORCE ROW LEVEL SECURITY;
CREATE POLICY child_accounts_policy ON app_private.child_accounts TO iharu_policy USING(true) WITH CHECK(true);
CREATE POLICY parent_declarations_policy ON app_private.parent_declarations TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.child_accounts,app_private.parent_declarations FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE ON app_private.child_accounts,app_private.parent_declarations TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.child_account_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a app_private.child_accounts%ROWTYPE; f app.families%ROWTYPE; ch app.children%ROWTYPE;
 actor uuid:=app_private.actor(); fid uuid; device_id uuid; result jsonb; pname text;
BEGIN
 IF op='childaccount.register' THEN
  IF length(p->>'name') NOT BETWEEN 1 AND 24 OR (p->>'loginId') !~ '^i[a-z0-9]{10}$' OR length(p->>'passwordHash') NOT BETWEEN 80 AND 220
   OR (p->>'proofHash') !~ '^[a-f0-9]{64}$' OR (p->>'codeHash') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.child_accounts(login_id,name,password_hash,proof_hash,code_hash) VALUES(p->>'loginId',p->>'name',p->>'passwordHash',p->>'proofHash',p->>'codeHash') RETURNING * INTO a;
  RETURN jsonb_build_object('loginId',a.login_id,'name',a.name,'status','WAITING','expiresAt',a.code_expires_at);
 ELSIF op='childaccount.credentials' THEN
  SELECT * INTO a FROM app_private.child_accounts WHERE login_id=p->>'loginId' AND (child_id IS NOT NULL OR pending_expires_at>now());
  RETURN CASE WHEN FOUND THEN jsonb_build_object('passwordHash',a.password_hash) ELSE '{}'::jsonb END;
 ELSIF op IN ('childaccount.status','childaccount.renew','childaccount.finish','childaccount.login') THEN
  IF op='childaccount.login' THEN
   SELECT * INTO a FROM app_private.child_accounts WHERE login_id=p->>'loginId' AND password_hash=p->>'passwordHash' FOR UPDATE;
  ELSE SELECT * INTO a FROM app_private.child_accounts WHERE proof_hash=p->>'proofHash' FOR UPDATE; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHILD_LOGIN_INVALID'; END IF;
  IF a.child_id IS NULL AND a.pending_expires_at<=now() THEN RAISE EXCEPTION 'CHILD_SIGNUP_EXPIRED'; END IF;
  IF op='childaccount.renew' OR (op='childaccount.login' AND a.child_id IS NULL) THEN
   UPDATE app_private.child_accounts SET proof_hash=coalesce(p->>'newProofHash',proof_hash),code_hash=p->>'codeHash',code_expires_at=now()+interval '15 minutes' WHERE id=a.id RETURNING * INTO a;
   RETURN jsonb_build_object('loginId',a.login_id,'name',a.name,'status','WAITING','expiresAt',a.code_expires_at);
  END IF;
  IF a.child_id IS NULL AND op='childaccount.finish' THEN RAISE EXCEPTION 'CHILD_NOT_APPROVED'; END IF;
  IF a.child_id IS NULL THEN RETURN jsonb_build_object('loginId',a.login_id,'name',a.name,'status',CASE WHEN a.code_expires_at<=now() THEN 'EXPIRED' ELSE 'WAITING' END,'expiresAt',a.code_expires_at); END IF;
  SELECT * INTO ch FROM app.children WHERE id=a.child_id AND status='ACTIVE';
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.child_consents WHERE child_id=ch.id AND purpose='general' AND revoked_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM app.memberships m JOIN iharu_auth.members am ON am.id=m.member_id WHERE m.family_id=ch.family_id AND m.member_id=a.approved_by AND m.status='ACTIVE' AND am.status='ACTIVE') THEN RAISE EXCEPTION 'CHILD_ACCESS_REVOKED'; END IF;
  IF op='childaccount.status' THEN RETURN jsonb_build_object('loginId',a.login_id,'name',a.name,'status','APPROVED','familyName',(SELECT name FROM app.families WHERE id=ch.family_id)); END IF;
  IF op='childaccount.finish' AND a.finished_device_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM app.child_devices WHERE id=a.finished_device_id AND status='ACTIVE' AND expires_at>now()) THEN RAISE EXCEPTION 'CHILD_ACCESS_REVOKED'; END IF;
   RETURN jsonb_build_object('status','CONNECTED','loginId',a.login_id,'sealed',a.sealed_response);
  END IF;
  -- Both code approval and session issuance serialize on the child row.
  PERFORM pg_advisory_xact_lock(hashtextextended(ch.id::text,75));
  IF (SELECT count(*) FROM app.child_devices WHERE child_id=ch.id AND status='ACTIVE' AND expires_at>now())>=2 THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
  IF (p->>'deviceHash') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app.child_devices(family_id,child_id,label,token_hash) VALUES(ch.family_id,ch.id,'자녀 로그인',p->>'deviceHash') RETURNING id INTO device_id;
  IF op='childaccount.finish' THEN UPDATE app_private.child_accounts SET finished_device_id=device_id,sealed_response=p->>'sealed' WHERE id=a.id; END IF;
  RETURN jsonb_build_object('status','CONNECTED','loginId',a.login_id,'childId',ch.id,'deviceId',device_id,'sealed',CASE WHEN op='childaccount.finish' THEN p->>'sealed' ELSE NULL END);
 END IF;
 -- Parent-only operations validate the real auth session again inside the policy boundary.
 IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='childaccount.parent' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',ff.id,'name',ff.name,'owner',ff.owner_id=actor,'children',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nickname',c.nickname,'loginId',ca.login_id) ORDER BY c.created_at) FROM app.children c LEFT JOIN app_private.child_accounts ca ON ca.child_id=c.id WHERE c.family_id=ff.id AND c.status='ACTIVE' AND (c.consenter_id=actor OR app_private.child_allowed(c.id))),'[]'::jsonb)) ORDER BY ff.created_at),'[]'::jsonb) INTO result
  FROM app.families ff JOIN app.memberships m ON m.family_id=ff.id AND m.member_id=actor AND m.status='ACTIVE' WHERE ff.status='ACTIVE';
  RETURN jsonb_build_object('families',result,'pending',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ff.id,'name',ff.name)) FROM app.memberships mm JOIN app.families ff ON ff.id=mm.family_id WHERE mm.member_id=actor AND mm.status='PENDING' AND ff.status='ACTIVE'),'[]'::jsonb));
 ELSIF op IN ('childaccount.resolve','childaccount.approve') THEN
  SELECT * INTO a FROM app_private.child_accounts WHERE code_hash=p->>'codeHash' FOR UPDATE;
  IF NOT FOUND OR a.child_id IS NOT NULL OR a.code_expires_at<=now() OR a.pending_expires_at<=now() THEN RAISE EXCEPTION 'CHILD_CODE_INVALID'; END IF;
  IF op='childaccount.resolve' THEN RETURN jsonb_build_object('requestId',a.id,'name',a.name,'loginId',a.login_id,'expiresAt',a.code_expires_at); END IF;
  IF a.id IS DISTINCT FROM (p->>'requestId')::uuid OR coalesce((p->>'consent')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,75));
  fid:=nullif(p->>'familyId','')::uuid;
  IF fid IS NULL THEN SELECT id INTO fid FROM app.families WHERE owner_id=actor AND status='ACTIVE' ORDER BY created_at LIMIT 1; END IF;
  IF fid IS NULL THEN
   IF (SELECT count(*) FROM app.memberships WHERE member_id=actor AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'FAMILY_LIMIT'; END IF;
   SELECT left(u.name,30)||'의 가족' INTO pname FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE m.id=actor;
   INSERT INTO app.families(name,owner_id) VALUES(coalesce(pname,'우리 가족'),actor) RETURNING id INTO fid;
   INSERT INTO app.memberships(family_id,member_id,status) VALUES(fid,actor,'ACTIVE');
  END IF;
  SELECT * INTO f FROM app.families WHERE id=fid AND status='ACTIVE' AND owner_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF (SELECT count(*) FROM app.children WHERE family_id=f.id AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'CHILD_LIMIT'; END IF;
  INSERT INTO app_private.parent_declarations(member_id) VALUES(actor) ON CONFLICT DO NOTHING;
  UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
  INSERT INTO app.children(family_id,nickname,consenter_id) VALUES(f.id,a.name,actor) RETURNING * INTO ch;
  INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(f.id,ch.id,'general',actor,'parent-link-1','child-account:'||a.id::text);
  INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,tuition_read,tuition_write,approved_by) VALUES(f.id,ch.id,actor,true,true,true,true,actor);
  INSERT INTO app.rooms(family_id,child_id) VALUES(f.id,ch.id);
  UPDATE app_private.child_accounts SET child_id=ch.id,approved_by=actor,approved_at=now() WHERE id=a.id;
  PERFORM app_private.record_event('PARENT_CHILD_ACCOUNT_APPROVED',ch.id);
  RETURN jsonb_build_object('status','APPROVED','childId',ch.id,'name',ch.nickname,'familyName',f.name);
 END IF;
 RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
REVOKE ALL ON FUNCTION app_private.child_account_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.child_account_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
