-- Role-bound, single-use invitations. The existing workspace commands still own group transitions.
ALTER TABLE app_private.workspace_invites
 ADD COLUMN link_kind text,
 ADD COLUMN guardian_application_id uuid REFERENCES app_private.guardian_applications(id),
 ADD CONSTRAINT workspace_invite_link_kind_check CHECK (
  (link_kind IS NULL AND guardian_application_id IS NULL)
  OR (link_kind IS NOT NULL AND (
   (link_kind='PARENT' AND guardian_application_id IS NULL)
   OR (link_kind='CHILD' AND guardian_application_id IS NOT NULL)
  ))
 );
CREATE INDEX workspace_invite_pending_host ON app_private.workspace_invites(host_id,expires_at)
 WHERE link_kind IS NOT NULL AND used_by IS NULL AND revoked_at IS NULL;
CREATE INDEX workspace_invite_guardian ON app_private.workspace_invites(guardian_application_id)
 WHERE guardian_application_id IS NOT NULL;

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_pre_invite_links;
REVOKE ALL ON FUNCTION app_private.workspace_command_pre_invite_links(text,jsonb) FROM PUBLIC,app_runtime;

CREATE FUNCTION app_private.invite_link_guardian(application_id uuid,member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.registration_released() AND EXISTS (
  SELECT 1 FROM app_private.guardian_applications g
  WHERE g.id=application_id AND g.applicant_id=member AND g.state='APPROVED' AND g.relationship='LEGAL_GUARDIAN'
   AND g.expires_at>now() AND g.verified_birth_date IS NOT NULL
   AND g.evidence_ref IS NOT NULL AND g.verified_subject_ref IS NOT NULL
   AND g.reviewer_id IS NOT NULL AND g.consumed_at IS NULL AND g.bound_draft_id IS NULL
   AND NOT EXISTS (
    SELECT 1 FROM app_private.guardian_applications used
    WHERE used.verified_subject_ref=g.verified_subject_ref AND used.consumed_at IS NOT NULL
   )
 )
$$;
REVOKE ALL ON FUNCTION app_private.invite_link_guardian(uuid,uuid) FROM PUBLIC,app_runtime;

CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 identity jsonb; who uuid; member uuid:=app_private.actor(); kind text:=p->>'kind'; publication uuid;
 family app_private.workspace_families%ROWTYPE; invitation app_private.workspace_invites%ROWTYPE;
 guardian app_private.guardian_applications%ROWTYPE; host_member uuid; result jsonb; child uuid;
BEGIN
 IF op IN ('workspace.invite.link.options','workspace.invite.link.issue','workspace.invite.link.revoke') THEN
  IF NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  identity:=app_private.workspace_command_pre_invite_links('workspace.me','{}');
  who:=(identity->>'id')::uuid;
  IF identity->'family' IS DISTINCT FROM 'null'::jsonb AND identity->'family'->>'isHost'<>'true'
   THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
  IF op='workspace.invite.link.options' THEN
   RETURN jsonb_build_object('childRegistrationReady',app_private.registration_released(),
    'children',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'label',g.target_label) ORDER BY g.created_at)
     FROM app_private.guardian_applications g WHERE g.applicant_id=member AND app_private.invite_link_guardian(g.id,member)),'[]'::jsonb),
    'pending',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'kind',i.link_kind,'expiresAt',i.expires_at) ORDER BY i.expires_at)
     FROM app_private.workspace_invites i JOIN app_private.workspace_families f ON f.id=i.family_id
     WHERE i.host_id=who AND f.id=(identity->'family'->>'id')::uuid AND i.family_epoch=f.epoch
       AND i.link_kind IS NOT NULL AND i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
       AND (i.link_kind='PARENT' OR app_private.invite_link_guardian(i.guardian_application_id,member))),'[]'::jsonb));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,76));
  IF op='workspace.invite.link.revoke' THEN
   UPDATE app_private.workspace_invites SET revoked_at=now()
    WHERE id=(p->>'inviteId')::uuid AND host_id=who AND link_kind IS NOT NULL AND used_by IS NULL AND revoked_at IS NULL;
   RETURN jsonb_build_object('ok',true);
  END IF;
  IF kind IS NULL OR kind NOT IN ('PARENT','CHILD') OR p->>'consent' IS DISTINCT FROM 'true'
   OR coalesce(p->>'codeHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF publication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances
   WHERE member_id=member AND publication_id=publication AND withdrawn_at IS NULL)
   THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
  IF kind='CHILD' THEN
   SELECT * INTO guardian FROM app_private.guardian_applications WHERE id=(p->>'guardianApplicationId')::uuid AND applicant_id=member;
   IF NOT FOUND OR NOT app_private.invite_link_guardian(guardian.id,member) THEN RAISE EXCEPTION 'GUARDIAN_REQUIRED'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.workspace_links WHERE profile_id=who AND active) THEN
   -- Reuse group bootstrap and the host's existing declaration.
   PERFORM app_private.workspace_command_pre_invite_links('workspace.invite.issue',p);
   SELECT * INTO invitation FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash';
  ELSE
   SELECT f.* INTO family FROM app_private.workspace_families f JOIN app_private.workspace_links l
    ON l.family_id=f.id AND l.profile_id=who AND l.active WHERE f.host_id=who FOR UPDATE OF f;
   IF NOT FOUND THEN RAISE EXCEPTION 'HOST_ONLY'; END IF;
   IF (SELECT count(*) FROM app_private.workspace_invites WHERE host_id=who AND family_epoch=family.epoch
       AND link_kind IS NOT NULL AND used_by IS NULL AND revoked_at IS NULL AND expires_at>now())>=20
    THEN RAISE EXCEPTION 'INVITE_LIMIT'; END IF;
   INSERT INTO app_private.workspace_invites(family_id,host_id,family_epoch,code_hash)
    VALUES(family.id,who,family.epoch,p->>'codeHash') RETURNING * INTO invitation;
  END IF;
  UPDATE app_private.workspace_invites SET link_kind=kind,guardian_application_id=guardian.id,
   expires_at=least(now()+interval '24 hours',guardian.expires_at)
   WHERE id=invitation.id RETURNING * INTO invitation;
  RETURN jsonb_build_object('id',invitation.id,'kind',kind,'expiresAt',invitation.expires_at);
 END IF;

 IF op IN ('workspace.invite.link.inspect','workspace.invite.link.accept','workspace.invite.link.signup') THEN
  IF op='workspace.invite.link.accept' AND NOT app_private.account_verified() THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF op='workspace.invite.link.signup' AND (member IS NOT NULL OR app_private.workspace_actor() IS NOT NULL) THEN RAISE EXCEPTION 'ROLE_CONFLICT'; END IF;
  IF op='workspace.invite.link.inspect' THEN
   SELECT * INTO invitation FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' AND link_kind IS NOT NULL;
  ELSE
   SELECT * INTO invitation FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash'
    AND id=(p->>'inviteId')::uuid AND link_kind=CASE WHEN op='workspace.invite.link.accept' THEN 'PARENT' ELSE 'CHILD' END FOR UPDATE;
  END IF;
  IF NOT FOUND OR invitation.used_by IS NOT NULL OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=now()
   THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  SELECT h.member_id,f.id,f.name INTO host_member,family.id,family.name
   FROM app_private.workspace_families f
   JOIN app_private.workspace_links l ON l.family_id=f.id AND l.profile_id=f.host_id AND l.active
   JOIN app_private.workspace_profiles h ON h.id=f.host_id AND h.kind='PARENT'
   JOIN iharu_auth.members m ON m.id=h.member_id AND m.status='ACTIVE'
   WHERE f.id=invitation.family_id AND f.host_id=invitation.host_id AND f.epoch=invitation.family_epoch;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  IF invitation.link_kind='CHILD' AND NOT app_private.invite_link_guardian(invitation.guardian_application_id,host_member)
   THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  IF op='workspace.invite.link.inspect' THEN
   RETURN jsonb_build_object('id',invitation.id,'kind',invitation.link_kind,'expiresAt',invitation.expires_at,
     'childSession',member IS NULL AND app_private.workspace_actor() IS NOT NULL)
    || CASE WHEN invitation.link_kind='PARENT' AND app_private.account_verified()
       THEN jsonb_build_object('familyName',family.name,'familyId',family.id) ELSE '{}'::jsonb END;
  END IF;
  IF op='workspace.invite.link.accept' THEN
   IF host_member=member THEN RAISE EXCEPTION 'OWN_CODE'; END IF;
   RETURN app_private.workspace_command_pre_invite_links('workspace.family.join',p);
  END IF;
  SELECT * INTO guardian FROM app_private.guardian_applications WHERE id=invitation.guardian_application_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(guardian.verified_subject_ref,79));
  IF NOT app_private.invite_link_guardian(guardian.id,host_member) THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
  UPDATE app_private.guardian_applications SET consumed_at=now(),updated_at=now(),version=version+1 WHERE id=guardian.id;
  result:=app_private.workspace_command_pre_invite_links('workspace.child.signup',p);
  SELECT a.child_id INTO STRICT child FROM app_private.workspace_invites i
   JOIN app_private.workspace_profiles w ON w.id=i.used_by JOIN app_private.child_accounts a ON a.id=w.child_account_id
   WHERE i.id=invitation.id;
  UPDATE app.children SET birth_date=guardian.verified_birth_date WHERE id=child;
  UPDATE app.child_consents SET evidence_ref=guardian.evidence_ref,policy_version='guardian-link-1'
   WHERE child_id=child AND purpose='general';
  RETURN result;
 END IF;
 -- Only the role-bound operations above may consume link invitations.
 IF op IN ('workspace.family.join','workspace.child.signup') AND EXISTS (
  SELECT 1 FROM app_private.workspace_invites WHERE code_hash=p->>'codeHash' AND link_kind IS NOT NULL
 ) THEN RAISE EXCEPTION 'INVITE_LINK_INVALID'; END IF;
 RETURN app_private.workspace_command_pre_invite_links(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
