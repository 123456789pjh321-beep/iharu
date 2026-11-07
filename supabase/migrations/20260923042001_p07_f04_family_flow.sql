-- F04: connect approved relationships to family registration. OPS-02 remains a release gate.
-- No real child information is collected through new endpoints while that gate is closed.
CREATE TABLE app_private.family_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 child_deletion_verified_at timestamptz,
 verification_reference text CHECK(length(verification_reference) BETWEEN 8 AND 160),
 CHECK ((child_deletion_verified_at IS NULL)=(verification_reference IS NULL))
);
INSERT INTO app_private.family_release(singleton) VALUES(true);
ALTER TABLE app_private.family_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.family_release FORCE ROW LEVEL SECURITY;
CREATE POLICY family_release_read ON app_private.family_release FOR SELECT TO iharu_policy USING(true);
REVOKE ALL ON app_private.family_release FROM PUBLIC,app_runtime;
GRANT SELECT ON app_private.family_release TO iharu_policy;
ALTER TABLE app_private.guardian_applications ADD COLUMN verified_birth_date date;
ALTER TABLE app_private.guardian_applications ADD COLUMN bound_draft_id uuid UNIQUE REFERENCES app_private.child_registration_drafts(id) ON DELETE SET NULL;
ALTER TABLE app_private.guardian_applications ADD COLUMN consumed_at timestamptz;
CREATE UNIQUE INDEX guardian_consumed_subject ON app_private.guardian_applications(verified_subject_ref) WHERE consumed_at IS NOT NULL;
GRANT UPDATE(access_ready) ON iharu_auth.members TO iharu_policy;
CREATE FUNCTION app_private.account_verified(recent boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
 JOIN iharu_auth.session s ON s."userId"=u.id JOIN iharu_auth.session_guard g ON g.session_id=s.id
 WHERE m.id=app_private.actor() AND m.status='ACTIVE' AND u."emailVerified" AND u.email NOT LIKE '%@identity.iharu.invalid'
 AND s.id=current_setting('iharu.session_id',true) AND g.assurance='HIGH'
 AND s."expiresAt">now() AND g.absolute_expires_at>now() AND g.last_seen_at>now()-interval '7 days'
 AND (NOT recent OR g.reauthenticated_at>now()-interval '5 minutes'))
$$;
CREATE FUNCTION app_private.registration_released() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM app_private.family_release WHERE singleton AND child_deletion_verified_at IS NOT NULL AND verification_reference IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION app_private.account_verified(boolean),app_private.registration_released() FROM PUBLIC;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
ALTER FUNCTION app_private.account_verified(boolean) OWNER TO iharu_policy;
ALTER FUNCTION app_private.registration_released() OWNER TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE OR REPLACE FUNCTION app_private.family_command(op text,p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor(); fid uuid; cid uuid; target uuid; result jsonb; now_at timestamptz:=now();
 f app.families%ROWTYPE; m app.memberships%ROWTYPE; ch app.children%ROWTYPE; g app.child_grants%ROWTYPE;
 inv app_private.invites%ROWTYPE; draft app_private.child_registration_drafts%ROWTYPE; proof app_private.consent_proofs%ROWTYPE;
 application app_private.guardian_applications%ROWTYPE;
 pairing app_private.device_pairings%ROWTYPE; device app.child_devices%ROWTYPE;
BEGIN
 IF op='onboarding.status' THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
  RETURN jsonb_build_object('canCreateFamily',app_private.guardian_ready() OR EXISTS(SELECT 1 FROM app_private.guardian_applications WHERE applicant_id=actor AND state='APPROVED' AND expires_at>now()),
   'relationshipVerification','MANUAL_REVIEW','reviewAvailable',EXISTS(SELECT 1 FROM app_private.guardian_reviewers WHERE enabled),
   'realChildRegistrationEnabled',app_private.registration_released() AND app_private.guardian_ready(),
   'registrationBlocker',CASE WHEN NOT app_private.registration_released() THEN 'DELETION_NOT_READY' ELSE NULL END);
 END IF;
 IF op IN ('family.create','invite.accept') THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
  IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  IF op='family.create' AND NOT app_private.guardian_ready() AND NOT EXISTS(SELECT 1 FROM app_private.guardian_applications WHERE applicant_id=actor AND state='APPROVED' AND expires_at>now()) THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED'; END IF;
  -- An invalid invitation rolls back this update. Membership approval AND a child grant
  -- remain mandatory; access_ready does not grant access to a child.
  UPDATE iharu_auth.members SET access_ready=true WHERE id=actor;
 END IF;
 IF op IN ('draft.create','draft.bind','consent.proof','child.activate') THEN PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,704)); END IF;
 IF op IN ('draft.bind','consent.proof','child.activate') AND NOT app_private.registration_released() THEN RAISE EXCEPTION 'REGISTRATION_NOT_READY'; END IF;
 -- Device endpoints authenticate the proof cookie separately. All other commands require a current HIGH session.
 IF op NOT IN ('pair.start','pair.status','pair.exchange','child.session','child.logout') AND NOT app_private.guardian_ready() THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
 IF op='draft.bind' THEN
  IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  -- Draft then application is also the lock order used by proof issuance/activation.
  SELECT * INTO draft FROM app_private.child_registration_drafts WHERE id=(p->>'draftId')::uuid AND applicant_id=actor FOR UPDATE;
  IF NOT FOUND OR NOT app_private.member_of(draft.family_id) OR draft.expires_at<=now() OR draft.state NOT IN ('DRAFT','PENDING','VERIFIED') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO application FROM app_private.guardian_applications WHERE id=(p->>'applicationId')::uuid AND applicant_id=actor FOR UPDATE;
  IF NOT FOUND OR application.state<>'APPROVED' OR application.expires_at<=now() OR application.consumed_at IS NOT NULL OR application.verified_birth_date IS NULL OR application.target_id IS DISTINCT FROM (p->>'targetId')::uuid THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED'; END IF;
  IF application.bound_draft_id IS NOT NULL AND application.bound_draft_id<>draft.id AND EXISTS(SELECT 1 FROM app_private.child_registration_drafts WHERE id=application.bound_draft_id AND expires_at<=now() AND state<>'ACTIVATED') THEN
   UPDATE app_private.child_registration_drafts SET state='REJECTED',verification_id=NULL,subject_ref=NULL,birth_date=NULL,evidence_ref=NULL WHERE id=application.bound_draft_id;
   UPDATE app_private.guardian_applications SET bound_draft_id=NULL WHERE id=application.id;
   application.bound_draft_id:=NULL;
  END IF;
  IF (application.bound_draft_id IS NOT NULL AND application.bound_draft_id<>draft.id) OR (draft.verification_id IS NOT NULL AND draft.verification_id<>'guardian:'||application.id::text) THEN RAISE EXCEPTION 'VERIFICATION_REUSED'; END IF;
  UPDATE app_private.child_registration_drafts SET state='VERIFIED',subject_ref=application.verified_subject_ref,birth_date=application.verified_birth_date,evidence_ref=application.evidence_ref,verification_id='guardian:'||application.id::text,expires_at=least(expires_at,application.expires_at) WHERE id=draft.id;
  UPDATE app_private.guardian_applications SET bound_draft_id=draft.id WHERE id=application.id;
  RETURN jsonb_build_object('id',draft.id);
 ELSIF op='me' THEN
  SELECT jsonb_build_object('families',coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'owner',x.owner_id=actor,'version',x.version) ORDER BY x.created_at),'[]')) INTO result
  FROM app.families x JOIN app.memberships mm ON mm.family_id=x.id AND mm.member_id=actor AND mm.status='ACTIVE' WHERE x.status='ACTIVE';
  RETURN result || jsonb_build_object('pending',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ff.id,'name',ff.name)) FROM app.memberships mm JOIN app.families ff ON ff.id=mm.family_id WHERE mm.member_id=actor AND mm.status='PENDING' AND ff.status='ACTIVE'),'[]'::jsonb));
 ELSIF op='family.create' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,41));
  IF (SELECT count(*) FROM app.memberships WHERE member_id=actor AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'FAMILY_LIMIT'; END IF;
  INSERT INTO app.families(name,owner_id) VALUES(p->>'name',actor) RETURNING * INTO f;
  INSERT INTO app.memberships(family_id,member_id,status) VALUES(f.id,actor,'ACTIVE');
  PERFORM app_private.record_event('FAMILY_CREATED',f.id); RETURN jsonb_build_object('id',f.id,'version',f.version);
 ELSIF op IN ('family.members','invite.create','owner.transfer','draft.create') THEN
  fid:=(p->>'familyId')::uuid;
  SELECT * INTO f FROM app.families WHERE id=fid AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR NOT app_private.member_of(fid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op='family.members' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',mm.id,'memberId',mm.member_id,'name',u.name,'status',mm.status,'owner',f.owner_id=mm.member_id,'version',mm.version) ORDER BY mm.created_at),'[]') INTO result
   FROM app.memberships mm JOIN iharu_auth.members ma ON ma.id=mm.member_id JOIN iharu_auth."user" u ON u.id=ma.auth_user_id
   WHERE mm.family_id=fid AND mm.status<>'REVOKED' AND (mm.status='ACTIVE' OR f.owner_id=actor OR mm.member_id=actor);
   RETURN jsonb_build_object('members',result);
  ELSIF op='draft.create' THEN
   SELECT * INTO draft FROM app_private.child_registration_drafts WHERE family_id=fid AND applicant_id=actor AND state IN ('DRAFT','PENDING','VERIFIED') AND expires_at>now_at ORDER BY expires_at DESC LIMIT 1;
   IF FOUND THEN RETURN jsonb_build_object('id',draft.id,'state',draft.state,'expiresAt',draft.expires_at); END IF;
   IF (SELECT count(*) FROM app.children WHERE family_id=fid AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'CHILD_LIMIT'; END IF;
   IF (SELECT count(*) FROM app_private.child_registration_drafts WHERE applicant_id=actor AND state<>'ACTIVATED' AND expires_at>now_at)>=10 THEN RAISE EXCEPTION 'DRAFT_LIMIT'; END IF;
   INSERT INTO app_private.child_registration_drafts(family_id,applicant_id) VALUES(fid,actor) RETURNING * INTO draft;
   RETURN jsonb_build_object('id',draft.id,'state',draft.state,'expiresAt',draft.expires_at);
  END IF;
  IF f.owner_id<>actor THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF op='invite.create' THEN
   IF (SELECT count(*) FROM app.memberships WHERE family_id=fid AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'ADULT_LIMIT'; END IF;
   UPDATE app_private.invites SET revoked_at=now_at WHERE family_id=fid AND accepted_by IS NULL AND revoked_at IS NULL;
   INSERT INTO app_private.invites(family_id,token_hash) VALUES(fid,p->>'tokenHash') RETURNING * INTO inv;
   RETURN jsonb_build_object('id',inv.id,'expiresAt',inv.expires_at);
  END IF;
  IF f.version<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  target:=(p->>'memberId')::uuid;
  IF target=actor OR NOT EXISTS(SELECT 1 FROM app.memberships WHERE family_id=fid AND member_id=target AND status='ACTIVE') THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
  UPDATE app.families SET owner_id=target,version=version+1 WHERE id=fid;
  PERFORM app_private.record_event('OWNER_TRANSFERRED',fid,true); RETURN jsonb_build_object('version',f.version+1);
 ELSIF op='invite.accept' THEN
  SELECT * INTO inv FROM app_private.invites WHERE token_hash=p->>'tokenHash' FOR UPDATE;
  IF NOT FOUND OR inv.expires_at<=now_at OR inv.revoked_at IS NOT NULL OR (inv.accepted_by IS NOT NULL AND inv.accepted_by<>actor) THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  SELECT * INTO f FROM app.families WHERE id=inv.family_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM app.memberships WHERE family_id=f.id AND member_id=actor AND status='ACTIVE') THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
  IF (SELECT count(*) FROM app.memberships WHERE family_id=f.id AND status IN ('ACTIVE','PENDING'))>=10 AND inv.accepted_by IS NULL THEN RAISE EXCEPTION 'ADULT_LIMIT'; END IF;
  UPDATE app_private.invites SET accepted_by=actor WHERE id=inv.id;
  INSERT INTO app.memberships(family_id,member_id,status) VALUES(f.id,actor,'PENDING')
  ON CONFLICT(family_id,member_id) DO UPDATE SET status='PENDING' WHERE app.memberships.status='REVOKED' RETURNING * INTO m;
  IF m.id IS NULL THEN SELECT * INTO m FROM app.memberships WHERE family_id=f.id AND member_id=actor; END IF;
  RETURN jsonb_build_object('status','PENDING','membershipId',m.id);
 ELSIF op IN ('member.approve','member.revoke') THEN
  SELECT * INTO m FROM app.memberships WHERE id=(p->>'membershipId')::uuid;
  SELECT * INTO f FROM app.families WHERE id=m.family_id FOR UPDATE;
  IF f.id IS NULL OR f.owner_id<>actor OR NOT app_private.member_of(f.id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO m FROM app.memberships WHERE id=m.id FOR UPDATE;
  IF m.version<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF op='member.approve' THEN
   IF m.status<>'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
   IF (SELECT count(*) FROM app.memberships WHERE family_id=f.id AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'ADULT_LIMIT'; END IF;
   UPDATE app.memberships SET status='ACTIVE',version=version+1 WHERE id=m.id;
  ELSE
   IF m.member_id=f.owner_id THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM app.children WHERE family_id=f.id AND consenter_id=m.member_id AND status='ACTIVE') THEN RAISE EXCEPTION 'CONSENTER_REQUIRED'; END IF;
   UPDATE app.memberships SET status='REVOKED',version=version+1 WHERE id=m.id;
   UPDATE app_private.invites SET revoked_at=now_at WHERE family_id=f.id AND accepted_by=m.member_id;
   UPDATE app.child_grants SET daily=false,chat=false,location=false,tuition_read=false,tuition_write=false,version=version+1 WHERE family_id=f.id AND member_id=m.member_id;
   UPDATE app.rooms SET epoch=epoch+1 WHERE family_id=f.id;
  END IF;
  PERFORM app_private.record_event(op,m.id,op='member.revoke'); RETURN jsonb_build_object('version',m.version+1);
 ELSIF op IN ('draft.get','consent.proof','child.activate') THEN
  SELECT * INTO draft FROM app_private.child_registration_drafts WHERE id=(p->>'draftId')::uuid AND applicant_id=actor FOR UPDATE;
  IF NOT FOUND OR draft.expires_at<=now_at OR NOT app_private.member_of(draft.family_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op='draft.get' THEN RETURN jsonb_build_object('id',draft.id,'state',draft.state,'expiresAt',draft.expires_at,'birthDate',CASE WHEN draft.state='VERIFIED' THEN draft.birth_date END); END IF;
  IF draft.verification_id LIKE 'guardian:%' THEN
   SELECT * INTO application FROM app_private.guardian_applications WHERE bound_draft_id=draft.id AND applicant_id=actor FOR UPDATE;
   IF NOT FOUND OR application.state<>'APPROVED' OR application.expires_at<=now() OR application.consumed_at IS NOT NULL OR application.verified_subject_ref IS DISTINCT FROM draft.subject_ref OR application.verified_birth_date IS DISTINCT FROM draft.birth_date THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED'; END IF;
  END IF;
  IF draft.state<>'VERIFIED' OR draft.subject_ref IS NULL OR draft.evidence_ref IS NULL OR draft.birth_date IS NULL THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED'; END IF;
  IF op='consent.proof' THEN
   IF p->>'policyVersion'<>'6.1' OR (p->>'general')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
   UPDATE app_private.consent_proofs SET consumed_at=now_at WHERE draft_id=draft.id AND consumed_at IS NULL;
   INSERT INTO app_private.consent_proofs(draft_id,applicant_id,family_id,subject_ref,birth_date,policy_version,location)
   VALUES(draft.id,actor,draft.family_id,draft.subject_ref,draft.birth_date,'6.1',(p->>'location')::boolean) RETURNING * INTO proof;
   RETURN jsonb_build_object('proofId',proof.id,'expiresAt',proof.expires_at);
  END IF;
  SELECT * INTO f FROM app.families WHERE id=draft.family_id FOR UPDATE;
  IF f.id<>(p->>'familyId')::uuid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO proof FROM app_private.consent_proofs WHERE id=(p->>'proofId')::uuid AND draft_id=draft.id AND applicant_id=actor FOR UPDATE;
  IF NOT FOUND OR proof.consumed_at IS NOT NULL OR proof.expires_at<=now_at OR proof.subject_ref<>draft.subject_ref OR proof.birth_date<>(p->>'birthDate')::date OR proof.family_id<>f.id THEN RAISE EXCEPTION 'PROOF_INVALID'; END IF;
  IF (SELECT count(*) FROM app.children WHERE family_id=f.id AND status='ACTIVE')>=5 THEN RAISE EXCEPTION 'CHILD_LIMIT'; END IF;
  INSERT INTO app.children(family_id,nickname,birth_date,consenter_id) VALUES(f.id,p->>'nickname',proof.birth_date,actor) RETURNING * INTO ch;
  INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(f.id,ch.id,'general',actor,'6.1',draft.evidence_ref);
  IF proof.location THEN INSERT INTO app.child_consents(family_id,child_id,purpose,consenter_id,policy_version,evidence_ref) VALUES(f.id,ch.id,'location',actor,'6.1',draft.evidence_ref); END IF;
  INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,location,tuition_read,tuition_write,approved_by) VALUES(f.id,ch.id,actor,true,true,proof.location,true,true,actor);
  INSERT INTO app.rooms(family_id,child_id) VALUES(f.id,ch.id);
  UPDATE app_private.consent_proofs SET consumed_at=now_at WHERE id=proof.id;
  UPDATE app_private.guardian_applications SET consumed_at=now() WHERE bound_draft_id=draft.id;
  UPDATE app_private.child_registration_drafts SET state='ACTIVATED',child_id=ch.id WHERE id=draft.id;
  PERFORM app_private.record_event('CHILD_ACTIVATED',ch.id); RETURN jsonb_build_object('id',ch.id,'version',ch.version);
 ELSIF op='children.list' THEN
  fid:=(p->>'familyId')::uuid;
  IF NOT app_private.member_of(fid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nickname',c.nickname,'version',c.version,'canManage',c.consenter_id=actor,'locationConsent',EXISTS(SELECT 1 FROM app.child_consents co WHERE co.child_id=c.id AND co.purpose='location' AND co.revoked_at IS NULL)) ORDER BY c.created_at),'[]') INTO result FROM app.children c WHERE c.family_id=fid AND app_private.child_allowed(c.id);
  RETURN jsonb_build_object('children',result);
 ELSIF op IN ('grants.get','grants.put','devices.list','device.revoke','consents.get','consent.revoke') THEN
  cid:=(p->>'childId')::uuid;
  SELECT * INTO ch FROM app.children WHERE id=cid FOR UPDATE;
  IF NOT FOUND OR NOT app_private.child_allowed(cid,'manage') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF op='grants.get' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',mm.member_id,'name',u.name,'consenter',mm.member_id=ch.consenter_id,'daily',coalesce(cg.daily,false),'chat',coalesce(cg.chat,false),'location',coalesce(cg.location,false),'tuitionRead',coalesce(cg.tuition_read,false),'tuitionWrite',coalesce(cg.tuition_write,false),'version',coalesce(cg.version,0))),'[]') INTO result
   FROM app.memberships mm JOIN iharu_auth.members ma ON ma.id=mm.member_id JOIN iharu_auth."user" u ON u.id=ma.auth_user_id
   LEFT JOIN app.child_grants cg ON cg.child_id=cid AND cg.member_id=mm.member_id WHERE mm.family_id=ch.family_id AND mm.status='ACTIVE';
   RETURN jsonb_build_object('grants',result);
  ELSIF op='grants.put' THEN
   target:=(p->>'memberId')::uuid;
   IF target=ch.consenter_id THEN RAISE EXCEPTION 'CONSENTER_REQUIRED'; END IF;
   IF NOT EXISTS(SELECT 1 FROM app.memberships WHERE family_id=ch.family_id AND member_id=target AND status='ACTIVE') THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
   SELECT * INTO g FROM app.child_grants WHERE child_id=cid AND member_id=target FOR UPDATE;
   IF coalesce(g.version,0)<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF (p->>'location')::boolean AND NOT EXISTS(SELECT 1 FROM app.child_consents WHERE child_id=cid AND purpose='location' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'LOCATION_CONSENT_REQUIRED'; END IF;
   INSERT INTO app.child_grants(family_id,child_id,member_id,daily,chat,location,tuition_read,tuition_write,approved_by,starts_seq)
   VALUES(ch.family_id,cid,target,(p->>'daily')::bool,(p->>'chat')::bool,(p->>'location')::bool,(p->>'tuitionRead')::bool,(p->>'tuitionWrite')::bool,actor,(SELECT last_seq+1 FROM app.rooms WHERE child_id=cid))
   ON CONFLICT(child_id,member_id) DO UPDATE SET daily=excluded.daily,chat=excluded.chat,location=excluded.location,tuition_read=excluded.tuition_read,tuition_write=excluded.tuition_write,
   starts_seq=CASE WHEN NOT app.child_grants.chat AND excluded.chat THEN excluded.starts_seq ELSE app.child_grants.starts_seq END,
   starts_at=CASE WHEN NOT app.child_grants.chat AND excluded.chat THEN now_at ELSE app.child_grants.starts_at END,version=app.child_grants.version+1;
   IF coalesce(g.chat,false) IS DISTINCT FROM (p->>'chat')::bool THEN UPDATE app.rooms SET epoch=epoch+1 WHERE child_id=cid; END IF;
   PERFORM app_private.record_event('GRANTS_CHANGED',cid,true); RETURN jsonb_build_object('version',coalesce(g.version,0)+1);
  ELSIF op='devices.list' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'status',d.status,'lastSeenAt',d.last_seen_at) ORDER BY d.last_seen_at DESC),'[]') INTO result FROM app.child_devices d WHERE d.child_id=cid AND d.status='ACTIVE' AND d.expires_at>now_at;
   RETURN jsonb_build_object('devices',result);
  ELSIF op='device.revoke' THEN
   UPDATE app.child_devices SET status='REVOKED',session_epoch=session_epoch+1 WHERE id=(p->>'deviceId')::uuid AND child_id=cid RETURNING id INTO target;
   IF target IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   UPDATE app_private.device_pairings SET sealed_response=NULL,state='REVOKED' WHERE device_id=target;
   PERFORM app_private.record_event('DEVICE_REVOKED',target,true); RETURN jsonb_build_object('status','REVOKED');
  ELSIF op='consents.get' THEN
   SELECT jsonb_agg(jsonb_build_object('purpose',purpose,'policyVersion',policy_version,'grantedAt',granted_at,'revokedAt',revoked_at)) INTO result FROM app.child_consents WHERE child_id=cid;
   RETURN jsonb_build_object('consents',result,'version',ch.version);
  END IF;
  IF ch.version<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  UPDATE app.child_consents SET revoked_at=now_at WHERE child_id=cid AND purpose=p->>'purpose' AND revoked_at IS NULL;
  UPDATE app.children SET version=version+1,consent_epoch=consent_epoch+1 WHERE id=cid;
  IF p->>'purpose'='general' THEN
   UPDATE app.children SET status='REVOKED' WHERE id=cid;
   UPDATE app.child_devices SET status='REVOKED',session_epoch=session_epoch+1 WHERE child_id=cid;
   UPDATE app_private.device_pairings SET sealed_response=NULL,state='REVOKED' WHERE child_id=cid;
   UPDATE app.rooms SET epoch=epoch+1 WHERE child_id=cid;
   INSERT INTO app_private.deletion_requests(child_id) VALUES(cid) ON CONFLICT DO NOTHING;
   PERFORM app_private.record_event('GENERAL_CONSENT_REVOKED',cid,true);
  ELSE
   UPDATE app.child_grants SET location=false,version=version+1 WHERE child_id=cid;
   PERFORM app_private.record_event('LOCATION_CONSENT_REVOKED',cid,true);
  END IF;
  RETURN jsonb_build_object('status','REVOKED','version',ch.version+1);
 ELSIF op='pair.start' THEN
  UPDATE app_private.device_pairings SET state='REVOKED',sealed_response=NULL WHERE proof_hash=p->>'previousProofHash' AND state<>'EXCHANGED';
  UPDATE app_private.device_pairings SET state='REVOKED',sealed_response=NULL WHERE expires_at<=now_at AND state IN ('WAITING','APPROVED');
  UPDATE app_private.device_pairings SET sealed_response=NULL WHERE retry_until<=now_at AND sealed_response IS NOT NULL;
  INSERT INTO app_private.device_pairings(code_hash,proof_hash,label) VALUES(p->>'codeHash',p->>'proofHash',p->>'label') RETURNING * INTO pairing;
  RETURN jsonb_build_object('id',pairing.id,'expiresAt',pairing.expires_at,'version',pairing.version);
 ELSIF op='pair.resolve' THEN
  SELECT * INTO pairing FROM app_private.device_pairings WHERE code_hash=p->>'codeHash' AND state IN ('WAITING','APPROVED') AND expires_at>now_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'CODE_INVALID'; END IF;
  RETURN jsonb_build_object('id',pairing.id,'label',pairing.label,'version',pairing.version,'expiresAt',pairing.expires_at);
 ELSIF op IN ('pair.approve','pair.status','pair.exchange') THEN
  SELECT * INTO pairing FROM app_private.device_pairings WHERE id=(p->>'pairingId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAIRING_INVALID'; END IF;
  IF op='pair.approve' THEN
   IF pairing.state<>'WAITING' OR pairing.expires_at<=now_at OR pairing.version<>(p->>'expectedVersion')::int THEN RAISE EXCEPTION 'PAIRING_INVALID'; END IF;
   cid:=(p->>'childId')::uuid;
   SELECT * INTO ch FROM app.children WHERE id=cid FOR UPDATE;
   IF NOT app_private.child_allowed(cid,'manage') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF (SELECT count(*) FROM app.child_devices WHERE child_id=cid AND status='ACTIVE' AND expires_at>now_at)>=2 THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
   UPDATE app_private.device_pairings SET state='APPROVED',family_id=ch.family_id,child_id=cid,approved_by=actor,version=version+1 WHERE id=pairing.id;
   PERFORM app_private.record_event('PAIRING_APPROVED',pairing.id); RETURN jsonb_build_object('status','APPROVED');
  END IF;
  IF pairing.proof_hash IS DISTINCT FROM p->>'proofHash' OR pairing.state='REVOKED' THEN RAISE EXCEPTION 'PAIRING_INVALID'; END IF;
  IF op='pair.status' THEN
   RETURN jsonb_build_object('status',CASE WHEN pairing.expires_at<=now_at THEN 'EXPIRED' ELSE pairing.state END,'expiresAt',pairing.expires_at);
  END IF;
  IF pairing.state='EXCHANGED' THEN
   IF pairing.retry_until<=now_at OR pairing.exchange_key IS DISTINCT FROM (p->>'exchangeKey')::uuid OR pairing.sealed_response IS NULL
   OR NOT EXISTS(SELECT 1 FROM app.child_devices d JOIN app.children c ON c.id=d.child_id WHERE d.id=pairing.device_id AND d.status='ACTIVE' AND d.expires_at>now_at AND c.status='ACTIVE') THEN RAISE EXCEPTION 'PAIRING_RESTART'; END IF;
   RETURN jsonb_build_object('sealed',pairing.sealed_response);
  END IF;
  IF pairing.expires_at<=now_at OR pairing.state<>'APPROVED' THEN RAISE EXCEPTION 'PAIRING_INVALID'; END IF;
  SELECT * INTO ch FROM app.children WHERE id=pairing.child_id FOR UPDATE;
  IF ch.status<>'ACTIVE' OR NOT EXISTS(SELECT 1 FROM app.child_consents WHERE child_id=ch.id AND purpose='general' AND revoked_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM app.memberships mm JOIN iharu_auth.members ma ON ma.id=mm.member_id WHERE mm.family_id=ch.family_id AND mm.member_id=pairing.approved_by AND mm.status='ACTIVE' AND ma.status='ACTIVE' AND ma.access_ready)
  OR ch.consenter_id<>pairing.approved_by THEN RAISE EXCEPTION 'PAIRING_INVALID'; END IF;
  IF (SELECT count(*) FROM app.child_devices WHERE child_id=ch.id AND status='ACTIVE' AND expires_at>now_at)>=2 THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
  INSERT INTO app.child_devices(family_id,child_id,label,token_hash) VALUES(ch.family_id,ch.id,pairing.label,p->>'deviceHash') RETURNING * INTO device;
  UPDATE app_private.device_pairings SET state='EXCHANGED',device_id=device.id,exchange_key=(p->>'exchangeKey')::uuid,sealed_response=p->>'sealed',retry_until=now_at+interval '2 minutes' WHERE id=pairing.id;
  PERFORM app_private.record_event('DEVICE_CONNECTED',device.id); RETURN jsonb_build_object('sealed',p->>'sealed');
 ELSIF op IN ('child.session','child.logout') THEN
  SELECT * INTO device FROM app.child_devices WHERE token_hash=nullif(current_setting('iharu.device_hash',true),'') AND status='ACTIVE' AND expires_at>now_at AND last_seen_at>now_at-interval '7 days' FOR UPDATE;
  IF NOT FOUND OR NOT app_private.child_allowed(device.child_id) THEN RAISE EXCEPTION 'DEVICE_REQUIRED'; END IF;
  IF op='child.logout' THEN
   UPDATE app.child_devices SET status='REVOKED',session_epoch=session_epoch+1 WHERE id=device.id;
   UPDATE app_private.device_pairings SET sealed_response=NULL,state='REVOKED' WHERE device_id=device.id;
   PERFORM app_private.record_event('DEVICE_REVOKED',device.id,true); RETURN jsonb_build_object('status','REVOKED');
  END IF;
  UPDATE app.child_devices SET last_seen_at=now_at WHERE id=device.id;
  SELECT * INTO ch FROM app.children WHERE id=device.child_id;
  RETURN jsonb_build_object('id',device.id,'childId',ch.id,'nickname',ch.nickname,'locationAllowed',app_private.child_allowed(ch.id,'location'));
 END IF;
 RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
CREATE OR REPLACE FUNCTION app_private.guardian_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a uuid:=app_private.actor(); reviewer boolean; recent boolean; r app_private.guardian_applications; result jsonb;
BEGIN
 SELECT g.reauthenticated_at>now()-interval '5 minutes' INTO recent
 FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
 JOIN iharu_auth.session s ON s."userId"=u.id JOIN iharu_auth.session_guard g ON g.session_id=s.id
 WHERE m.id=a AND m.status='ACTIVE' AND u."emailVerified" AND u.email NOT LIKE '%@identity.iharu.invalid'
 AND s.id=current_setting('iharu.session_id',true) AND g.assurance='HIGH'
 AND s."expiresAt">now() AND g.absolute_expires_at>now() AND g.last_seen_at>now()-interval '7 days';
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_NOT_READY'; END IF;
 SELECT EXISTS(SELECT 1 FROM app_private.guardian_reviewers WHERE member_id=a AND enabled) INTO reviewer;
 IF op NOT IN ('guardian.list','guardian.queue') AND recent IS DISTINCT FROM true THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
 IF op IN ('guardian.queue','guardian.review','guardian.birth-date') AND NOT reviewer THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 -- Serialize submissions per applicant. Expiry is enforced on every read/write, not by a best-effort cron.
 PERFORM pg_advisory_xact_lock(hashtextextended(a::text,703));
 WITH expired AS (
 UPDATE app_private.guardian_applications SET state='EXPIRED',version=version+1,updated_at=now()
 WHERE expires_at<=now() AND state IN ('RECEIVED','REVIEWING','APPROVED') AND (applicant_id=a OR reviewer)
 RETURNING id)
 INSERT INTO app_private.guardian_application_events(application_id,actor_id,state,request_id)
 SELECT id,a,'EXPIRED',current_setting('iharu.request_id')::uuid FROM expired;
 IF op IN ('guardian.list','guardian.queue') THEN
 SELECT coalesce(jsonb_agg(t.data ORDER BY t.created_at DESC),'[]'::jsonb) INTO result FROM (
 SELECT created_at,jsonb_build_object('id',id,'targetId',target_id,'targetLabel',target_label,'relationship',relationship,
 'state',state,'version',version,'createdAt',created_at,'expiresAt',expires_at,'reason',reason,
 'consumed',consumed_at IS NOT NULL,'birthDateVerified',verified_birth_date IS NOT NULL,
 'canReview',reviewer AND applicant_id<>a AND (reviewer_id IS NULL OR reviewer_id=a),
 'applicantEmail',CASE WHEN op='guardian.queue' THEN (SELECT u.email FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE m.id=applicant_id) ELSE NULL END) AS data
 FROM app_private.guardian_applications WHERE (op='guardian.list' AND applicant_id=a) OR (op='guardian.queue' AND (state IN ('RECEIVED','REVIEWING') OR (state='APPROVED' AND consumed_at IS NULL AND verified_birth_date IS NULL)))
 ORDER BY created_at DESC LIMIT 100) t;
 RETURN jsonb_build_object('applications',result,'reviewer',reviewer,'registrationEnabled',app_private.registration_released(),'reviewAvailable',EXISTS(SELECT 1 FROM app_private.guardian_reviewers WHERE enabled));
 ELSIF op='guardian.submit' THEN
 SELECT * INTO r FROM app_private.guardian_applications WHERE applicant_id=a AND request_key=(p->>'requestKey')::uuid;
 IF FOUND THEN RETURN jsonb_build_object('id',r.id); END IF;
 IF (SELECT count(*) FROM app_private.guardian_applications WHERE applicant_id=a AND state IN ('RECEIVED','REVIEWING','APPROVED'))>=5 THEN RAISE EXCEPTION 'APPLICATION_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.guardian_applications WHERE applicant_id=a AND target_label=p->>'targetLabel' AND state IN ('RECEIVED','REVIEWING','APPROVED')) THEN RAISE EXCEPTION 'APPLICATION_DUPLICATE'; END IF;
 INSERT INTO app_private.guardian_applications(applicant_id,request_key,target_label,relationship)
 VALUES(a,(p->>'requestKey')::uuid,p->>'targetLabel',p->>'relationship') RETURNING * INTO r;
 ELSIF op='guardian.birth-date' THEN
  IF NOT app_private.registration_released() THEN RAISE EXCEPTION 'REGISTRATION_NOT_READY'; END IF;
  SELECT * INTO r FROM app_private.guardian_applications WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.applicant_id=a OR r.reviewer_id IS DISTINCT FROM a THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF r.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF r.state<>'APPROVED' OR r.expires_at<=now() OR r.consumed_at IS NOT NULL OR r.bound_draft_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF p->>'evidenceChecked' IS DISTINCT FROM 'true' OR (p->>'targetId')::uuid IS DISTINCT FROM r.target_id OR nullif(p->>'birthDate','') IS NULL THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED'; END IF;
  IF (p->>'birthDate')::date>current_date OR (p->>'birthDate')::date<DATE '1900-01-01' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  UPDATE app_private.guardian_applications SET verified_birth_date=(p->>'birthDate')::date,version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 ELSIF op='guardian.review' THEN
 SELECT * INTO r FROM app_private.guardian_applications WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF r.applicant_id=a OR (r.reviewer_id IS NOT NULL AND r.reviewer_id<>a) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF r.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF r.expires_at<=now() OR NOT ((r.state='RECEIVED' AND p->>'state'='REVIEWING') OR (r.state='REVIEWING' AND p->>'state' IN ('APPROVED','REJECTED'))) THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF p->>'state'='APPROVED' AND (p->>'evidenceChecked' IS DISTINCT FROM 'true' OR (p->>'targetId')::uuid IS DISTINCT FROM r.target_id
 OR coalesce(p->>'evidenceRef','')!~'^[A-Za-z0-9:_-]{8,120}$' OR coalesce(p->>'subjectRef','')!~'^[A-Za-z0-9:_-]{8,120}$') THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED'; END IF;
 IF p->>'state'='REJECTED' AND coalesce(length(trim(p->>'reason')),0) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 UPDATE app_private.guardian_applications SET state=p->>'state',reviewer_id=a,version=version+1,updated_at=now(),
 evidence_ref=CASE WHEN p->>'state'='APPROVED' THEN p->>'evidenceRef' ELSE evidence_ref END,
 verified_subject_ref=CASE WHEN p->>'state'='APPROVED' THEN p->>'subjectRef' ELSE verified_subject_ref END,
 reason=CASE WHEN p->>'state'='REJECTED' THEN trim(p->>'reason') ELSE NULL END,
 expires_at=CASE WHEN p->>'state'='APPROVED' THEN now()+interval '30 days' ELSE expires_at END
 WHERE id=r.id RETURNING * INTO r;
 ELSE RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 INSERT INTO app_private.guardian_application_events(application_id,actor_id,state,request_id)
 VALUES(r.id,a,r.state,current_setting('iharu.request_id')::uuid);
 RETURN jsonb_build_object('id',r.id,'state',r.state);
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

