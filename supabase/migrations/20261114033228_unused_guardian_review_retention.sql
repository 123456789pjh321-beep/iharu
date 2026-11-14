-- Expired applications that never entered review no longer serve the submission purpose.
-- Keep applications that were reviewed, used or referenced elsewhere.
CREATE INDEX guardian_unused_review_expiry ON app_private.guardian_applications (expires_at,id)
 WHERE state IN ('RECEIVED','EXPIRED') AND reviewer_id IS NULL AND reason IS NULL
   AND bound_draft_id IS NULL AND consumed_at IS NULL AND evidence_ref IS NULL
   AND verified_subject_ref IS NULL AND verified_birth_date IS NULL;

GRANT DELETE ON app_private.guardian_applications TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

ALTER FUNCTION app_private.cron_step(uuid,text) RENAME TO cron_step_before_unused_guardian_retention;
REVOKE ALL ON FUNCTION app_private.cron_step_before_unused_guardian_retention(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.cron_step(lease uuid, step text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; purged integer;
BEGIN
 result:=app_private.cron_step_before_unused_guardian_retention(lease,step);
 IF step<>'retention' THEN RETURN result; END IF;

 DELETE FROM app_private.guardian_applications WHERE id IN (
  SELECT g.id FROM app_private.guardian_applications g
  WHERE g.expires_at<=now() AND g.state IN ('RECEIVED','EXPIRED') AND g.reviewer_id IS NULL AND g.reason IS NULL
    AND g.bound_draft_id IS NULL AND g.consumed_at IS NULL AND g.evidence_ref IS NULL
    AND g.verified_subject_ref IS NULL AND g.verified_birth_date IS NULL
    AND NOT EXISTS (SELECT 1 FROM app_private.guardian_application_events e WHERE e.application_id=g.id AND e.state IN ('REVIEWING','APPROVED','REJECTED'))
    AND NOT EXISTS (SELECT 1 FROM app_private.workspace_invites i WHERE i.guardian_application_id=g.id)
  ORDER BY g.expires_at,g.id LIMIT 100 FOR UPDATE OF g SKIP LOCKED
 );
 GET DIAGNOSTICS purged=ROW_COUNT;
 RETURN result||jsonb_build_object('unusedGuardianReviewsPurged',purged);
END $$;

REVOKE ALL ON FUNCTION app_private.cron_step(uuid,text) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.cron_step(uuid,text) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
