CREATE TABLE app_private.privacy_deletion_verifications (
 request_id uuid PRIMARY KEY REFERENCES app_private.privacy_requests(id) ON DELETE CASCADE,
 reference uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.privacy_deletion_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_deletion_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_deletion_verification_policy ON app_private.privacy_deletion_verifications
 TO iharu_policy USING (true) WITH CHECK (true);
REVOKE ALL ON app_private.privacy_deletion_verifications FROM PUBLIC,app_runtime,worker_runtime;
GRANT SELECT,INSERT,UPDATE ON app_private.privacy_deletion_verifications TO iharu_policy;

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.legal_command(text,jsonb) RENAME TO legal_command_before_deletion_verification;

CREATE FUNCTION app_private.legal_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 req app_private.privacy_requests%ROWTYPE;
 proof jsonb:=p->'deletionVerification';
 result jsonb;
BEGIN
 IF op='legal.admin.requests' THEN
  result:=app_private.legal_command_before_deletion_verification(op,p);
  RETURN jsonb_build_object('items',coalesce((
   SELECT jsonb_agg(
    item||CASE WHEN v.request_id IS NULL THEN '{}'::jsonb ELSE
     jsonb_build_object('deletionVerification',jsonb_build_object('reference',v.reference,'verifiedAt',v.verified_at)) END
    ORDER BY ordinal
   )
   FROM jsonb_array_elements(result->'items') WITH ORDINALITY AS list(item,ordinal)
   LEFT JOIN app_private.privacy_deletion_verifications v
    ON v.request_id=(item->>'id')::uuid AND item->>'status'='COMPLETED'
  ),'[]'::jsonb));
 END IF;

 IF op='legal.admin.resolve' AND p->>'status'='COMPLETED' THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  -- Follow the lock order of the underlying privacy request command.
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR UPDATE;
  SELECT * INTO req FROM app_private.privacy_requests WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF (p->>'version')::integer IS DISTINCT FROM req.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;

  IF req.kind='DELETE' THEN
   IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
   IF jsonb_typeof(proof) IS DISTINCT FROM 'object'
      OR proof-'reference' IS DISTINCT FROM '{"authorityChecked":true,"deletionChecked":true,"copiesChecked":true}'::jsonb
      OR coalesce(proof->>'reference','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'DELETION_VERIFICATION_REQUIRED'; END IF;

   result:=app_private.legal_command_before_deletion_verification(op,p-'deletionVerification');
   INSERT INTO app_private.privacy_deletion_verifications(request_id,reference)
   VALUES(req.id,(proof->>'reference')::uuid)
   ON CONFLICT(request_id) DO UPDATE SET reference=excluded.reference,verified_at=now();
   RETURN result;
  END IF;
 END IF;

 IF p?'deletionVerification' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 RETURN app_private.legal_command_before_deletion_verification(op,p);
END $$;

REVOKE ALL ON FUNCTION app_private.legal_command_before_deletion_verification(text,jsonb),app_private.legal_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.legal_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
