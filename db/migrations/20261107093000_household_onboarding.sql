-- User-managed households are explicitly self-declared, never institutional relationship verification.
-- Existing verified-registration commands and release gates are unchanged.
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
-- Existing child columns, foreign keys and deletion policies remain untouched.
-- Erasure below is limited to profiles registered through this new command.
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
  IF (p->>'birthDate') IS NULL OR (p->>'birthDate')::date>(now() AT TIME ZONE 'Asia/Seoul')::date OR (p->>'birthDate')::date<date '1900-01-01' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app.children(family_id,nickname,consenter_id,birth_date) VALUES(fid,btrim(p->>'nickname'),actor,(p->>'birthDate')::date) RETURNING * INTO ch;
  INSERT INTO app_private.household_profiles(child_id,registered_by,consent_version) VALUES(ch.id,actor,'household-1');
  INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(fid,ch.id,'general',actor,'household-1','self-managed:'||ch.id::text);
  INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,location,tuition_read,tuition_write,approved_by) VALUES(fid,ch.id,actor,true,true,false,true,true,actor);
  INSERT INTO app.rooms(family_id,child_id) VALUES(fid,ch.id);
  PERFORM app_private.record_event('HOUSEHOLD_CHILD_CREATED_SELF_DECLARED',ch.id);
  RETURN jsonb_build_object('id',ch.id,'version',ch.version);
 ELSIF op='household.child.delete' THEN
  cid:=(p->>'childId')::uuid;
  SELECT * INTO ch FROM app.children WHERE id=cid FOR UPDATE;
  IF NOT FOUND OR ch.consenter_id<>actor OR NOT EXISTS(SELECT 1 FROM app_private.household_profiles WHERE child_id=cid AND registered_by=actor) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF ch.version<>(p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM app_private.child_registration_drafts WHERE child_id=cid) THEN RAISE EXCEPTION 'LEGACY_LINKED_PROFILE'; END IF;
  -- Idempotency payloads may hold copied titles. Remove this child's cached payloads too.
  DELETE FROM app_private.schedule_idempotency si WHERE si.payload::text LIKE '%'||cid::text||'%' OR si.response::text LIKE '%'||cid::text||'%'
   OR EXISTS(SELECT 1 FROM app.schedule_series s WHERE s.child_id=cid AND (si.payload::text LIKE '%'||s.id::text||'%' OR si.response::text LIKE '%'||s.id::text||'%'))
   OR EXISTS(SELECT 1 FROM app.occurrences o WHERE o.child_id=cid AND (si.payload::text LIKE '%'||o.id::text||'%' OR si.response::text LIKE '%'||o.id::text||'%'));
  WITH owned_ids AS (
   SELECT id::text id FROM app.checkins WHERE child_id=cid UNION SELECT id::text FROM app.tasks WHERE child_id=cid
   UNION SELECT id::text FROM app.learning_entries WHERE child_id=cid UNION SELECT id::text FROM app.pickups WHERE child_id=cid
  ) DELETE FROM app_private.daily_idempotency di WHERE di.payload::text LIKE '%'||cid::text||'%' OR di.response::text LIKE '%'||cid::text||'%'
   OR EXISTS(SELECT 1 FROM owned_ids o WHERE di.payload::text LIKE '%'||o.id||'%' OR di.response::text LIKE '%'||o.id||'%');
  DELETE FROM app_private.realtime_tickets WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid) OR device_id IN(SELECT id FROM app.child_devices WHERE child_id=cid);
  DELETE FROM app_private.message_jobs WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid);
  DELETE FROM app_private.message_receipts WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid);
  DELETE FROM app_private.message_changes WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid);
  DELETE FROM app.message_reads WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid);
  DELETE FROM app.messages WHERE room_id IN(SELECT id FROM app.rooms WHERE child_id=cid);
  DELETE FROM app.rooms WHERE child_id=cid;
  DELETE FROM app.learning_entries WHERE child_id=cid;
  DELETE FROM app.tasks WHERE child_id=cid;
  DELETE FROM app.checkins WHERE child_id=cid;
  DELETE FROM app.pickups WHERE child_id=cid;
  DELETE FROM app_private.daily_jobs WHERE child_id=cid;
  DELETE FROM app_private.daily_events WHERE child_id=cid;
  DELETE FROM app_private.schedule_template_imports WHERE child_id=cid;
  DELETE FROM app_private.schedule_template_previews WHERE child_id=cid;
  DELETE FROM app_private.notifications WHERE child_id=cid;
  DELETE FROM app_private.schedule_events WHERE child_id=cid;
  DELETE FROM app_private.schedule_previews WHERE occurrence_id IN(SELECT id FROM app.occurrences WHERE child_id=cid);
  UPDATE app.schedule_series SET makeup_for_occurrence_id=NULL WHERE child_id=cid AND makeup_for_occurrence_id IS NOT NULL;
  DELETE FROM app.occurrence_exceptions WHERE occurrence_id IN(SELECT id FROM app.occurrences WHERE child_id=cid);
  DELETE FROM app.occurrences WHERE child_id=cid;
  DELETE FROM app.schedule_closures WHERE series_id IN(SELECT id FROM app.schedule_series WHERE child_id=cid);
  DELETE FROM app.schedule_series_versions WHERE series_id IN(SELECT id FROM app.schedule_series WHERE child_id=cid);
  DELETE FROM app.schedule_series WHERE child_id=cid;
  DELETE FROM app_private.device_pairings WHERE child_id=cid;
  DELETE FROM app.child_devices WHERE child_id=cid;
  DELETE FROM app.child_grants WHERE child_id=cid;
  DELETE FROM app.child_consents WHERE child_id=cid;
  DELETE FROM app_private.deletion_requests WHERE child_id=cid;
  DELETE FROM app_private.household_profiles WHERE child_id=cid;
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
