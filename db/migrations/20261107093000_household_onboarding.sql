-- User-managed households are explicitly self-declared, never institutional relationship verification.
-- Existing verified-registration commands and release gates are unchanged.
ALTER TABLE app.children ALTER COLUMN birth_date DROP NOT NULL;
CREATE TABLE app_private.household_profiles(
 child_id uuid PRIMARY KEY REFERENCES app.children(id) ON DELETE CASCADE,
 registered_by uuid NOT NULL REFERENCES iharu_auth.members(id),
 consent_version text NOT NULL CHECK(consent_version='household-1'),
 authority_basis text NOT NULL DEFAULT 'SELF_DECLARED' CHECK(authority_basis='SELF_DECLARED'),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.household_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.household_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY household_executor ON app_private.household_profiles TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.household_profiles FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,DELETE ON app_private.household_profiles TO iharu_policy;
-- Child-owned data must be removed atomically. Only NO ACTION descendant FKs change;
-- existing SET NULL links (review history, correction references) retain their behavior.
DO $$ DECLARE fk record; BEGIN
 FOR fk IN
 WITH RECURSIVE owned(oid) AS (
  SELECT 'app.children'::regclass::oid UNION
  SELECT c.conrelid FROM pg_constraint c JOIN owned o ON c.confrelid=o.oid
  WHERE c.contype='f' AND c.confdeltype IN ('a','c') AND c.connamespace IN ('app'::regnamespace,'app_private'::regnamespace)
 ) SELECT c.conrelid::regclass AS tab,c.conname,pg_get_constraintdef(c.oid) AS definition
 FROM pg_constraint c WHERE c.contype='f' AND c.confdeltype='a' AND c.confrelid IN (SELECT oid FROM owned)
 AND c.connamespace IN ('app'::regnamespace,'app_private'::regnamespace)
 LOOP
 EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.tab,fk.conname);
 EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s ON DELETE CASCADE',fk.tab,fk.conname,fk.definition);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.household_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor();f app.families%ROWTYPE;ch app.children%ROWTYPE;fid uuid;cid uuid;result jsonb;
BEGIN
 IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
 IF op='household.status' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',ff.id,'name',ff.name,'owner',ff.owner_id=actor,'version',ff.version,
   'children',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nickname',c.nickname,'version',c.version,'canManage',c.consenter_id=actor,'locationConsent',EXISTS(SELECT 1 FROM app.child_consents co WHERE co.child_id=c.id AND co.purpose='location' AND co.revoked_at IS NULL),'managed',EXISTS(SELECT 1 FROM app_private.household_profiles hp WHERE hp.child_id=c.id),'deviceCount',(SELECT count(*) FROM app.child_devices d WHERE d.child_id=c.id AND d.status='ACTIVE' AND d.expires_at>now())) ORDER BY c.created_at),'[]'::jsonb) FROM app.children c WHERE c.family_id=ff.id AND c.status='ACTIVE' AND app_private.child_allowed(c.id)))),'[]'::jsonb) INTO result
   FROM app.families ff JOIN app.memberships mm ON mm.family_id=ff.id WHERE mm.member_id=actor AND mm.status='ACTIVE' AND ff.status='ACTIVE';
  RETURN jsonb_build_object('families',result,'pending',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ff.id,'name',ff.name)),'[]'::jsonb) FROM app.families ff JOIN app.memberships mm ON mm.family_id=ff.id WHERE mm.member_id=actor AND mm.status='PENDING' AND ff.status='ACTIVE'));
 END IF;
 IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
 IF op='household.create' THEN
  IF p->>'authorityConsent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  IF length(btrim(p->>'name')) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,41));
  IF (SELECT count(*) FROM app.memberships WHERE member_id=actor AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'FAMILY_LIMIT'; END IF;
  UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
  INSERT INTO app.families(name,owner_id) VALUES(btrim(p->>'name'),actor) RETURNING * INTO f;
  INSERT INTO app.memberships(family_id,member_id,status) VALUES(f.id,actor,'ACTIVE');
  PERFORM app_private.record_event('HOUSEHOLD_CREATED_SELF_MANAGED',f.id);
  RETURN jsonb_build_object('id',f.id);
 ELSIF op='household.child.create' THEN
  fid:=(p->>'familyId')::uuid;
  SELECT * INTO f FROM app.families WHERE id=fid AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR f.owner_id<>actor OR NOT app_private.member_of(fid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p->>'guardianConsent' IS DISTINCT FROM 'true' OR p->>'policyVersion' IS DISTINCT FROM 'household-1' THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  IF length(btrim(p->>'nickname')) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF (SELECT count(*) FROM app.children WHERE family_id=fid AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'CHILD_LIMIT'; END IF;
  INSERT INTO app.children(family_id,nickname,consenter_id,birth_date) VALUES(fid,btrim(p->>'nickname'),actor,NULL) RETURNING * INTO ch;
  INSERT INTO app_private.household_profiles(child_id,registered_by,consent_version) VALUES(ch.id,actor,'household-1');
  INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(fid,ch.id,'general',actor,'household-1','self-managed:'||ch.id::text);
  INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,location,tuition_read,tuition_write,approved_by) VALUES(fid,ch.id,actor,true,true,false,true,true,actor);
  INSERT INTO app.rooms(family_id,child_id) VALUES(fid,ch.id);
  PERFORM app_private.record_event('HOUSEHOLD_CHILD_CREATED_SELF_DECLARED',ch.id);
  RETURN jsonb_build_object('id',ch.id,'version',ch.version);
 ELSIF op='household.child.delete' THEN
  cid:=(p->>'childId')::uuid;
  SELECT * INTO ch FROM app.children WHERE id=cid FOR UPDATE;
  IF NOT FOUND OR ch.consenter_id<>actor OR NOT EXISTS(SELECT 1 FROM app_private.household_profiles WHERE child_id=cid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF ch.version<>(p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  -- Idempotency payloads may hold copied titles. Remove this child's cached payloads too.
  DELETE FROM app_private.schedule_idempotency WHERE payload::text LIKE '%'||cid::text||'%' OR response::text LIKE '%'||cid::text||'%';
  DELETE FROM app.children WHERE id=cid;
  PERFORM app_private.record_event('HOUSEHOLD_CHILD_DELETED',cid,true);
  RETURN jsonb_build_object('status','DELETED');
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;
REVOKE ALL ON FUNCTION app_private.household_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.household_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
