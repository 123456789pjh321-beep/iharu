-- P07-F07: leased minute ticks and bounded maintenance. No release attestations or live fixtures.
CREATE TABLE app_private.cron_runs (
 slot timestamptz PRIMARY KEY, token uuid NOT NULL UNIQUE, state text NOT NULL CHECK(state IN ('RUNNING','DONE','DEGRADED','FAILED','EXPIRED')),
 source text NOT NULL CHECK(source IN ('scheduled','manual')), started_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL, finished_at timestamptz, attempts integer NOT NULL DEFAULT 1,
 result jsonb NOT NULL DEFAULT '{}', error_code text
);
ALTER TABLE app_private.cron_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.cron_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_executor ON app_private.cron_runs TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.cron_runs FROM PUBLIC,app_runtime,worker_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.cron_runs TO iharu_policy;
ALTER TABLE app_private.daily_jobs DROP CONSTRAINT daily_jobs_state_check;
ALTER TABLE app_private.daily_jobs ADD CONSTRAINT daily_jobs_state_check CHECK(state IN ('PENDING','CANCELLED','DONE','EXPIRED','SKIPPED'));
CREATE INDEX cron_runs_retention ON app_private.cron_runs(finished_at);
CREATE INDEX daily_jobs_finished ON app_private.daily_jobs(finished_at) WHERE finished_at IS NOT NULL;
CREATE INDEX notifications_retention ON app_private.notifications(created_at);
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET ROLE iharu_policy;

CREATE FUNCTION app_private.cron_claim(origin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE minute_slot timestamptz:=date_trunc('minute',clock_timestamp()); new_token uuid:=gen_random_uuid();
BEGIN
 IF origin NOT IN ('scheduled','manual') OR origin IS NULL THEN RAISE EXCEPTION 'INVALID_SOURCE';END IF;
 IF NOT pg_try_advisory_xact_lock(17090707) THEN RETURN jsonb_build_object('state','BUSY');END IF;
 IF EXISTS(SELECT 1 FROM app_private.cron_runs WHERE state='RUNNING' AND lease_until>clock_timestamp()) THEN RETURN jsonb_build_object('state','BUSY');END IF;
 UPDATE app_private.cron_runs SET state='EXPIRED',finished_at=clock_timestamp(),error_code='LEASE_EXPIRED' WHERE state='RUNNING' AND lease_until<=clock_timestamp();
 INSERT INTO app_private.cron_runs(slot,token,state,source,lease_until) VALUES(minute_slot,new_token,'RUNNING',origin,clock_timestamp()+interval '90 seconds')
 ON CONFLICT(slot) DO UPDATE SET token=excluded.token,state='RUNNING',source=excluded.source,started_at=clock_timestamp(),lease_until=excluded.lease_until,finished_at=NULL,attempts=app_private.cron_runs.attempts+1,result='{}',error_code=NULL
 WHERE app_private.cron_runs.state IN ('FAILED','EXPIRED');
 IF NOT FOUND THEN RETURN jsonb_build_object('state','ALREADY_DONE');END IF;
 RETURN jsonb_build_object('state','CLAIMED','token',new_token);
END $$;
CREATE FUNCTION app_private.cron_finish(lease uuid,summary jsonb,failure text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF jsonb_typeof(summary)<>'object' OR pg_column_size(summary)>16000 OR failure IS NOT NULL AND failure<>'MAINTENANCE_FAILED' THEN RAISE EXCEPTION 'INVALID_RESULT';END IF;
 UPDATE app_private.cron_runs SET state=CASE WHEN failure IS NOT NULL THEN 'FAILED' WHEN summary->>'degraded'='true' THEN 'DEGRADED' ELSE 'DONE' END,finished_at=clock_timestamp(),result=summary,error_code=failure
 WHERE token=lease AND state='RUNNING' AND lease_until>clock_timestamp();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION app_private.schedule_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE key_value text:='schedule:'||(now() AT TIME ZONE 'Asia/Seoul')::date; j app_private.schedule_jobs%ROWTYPE; sid uuid; n integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(17090401) THEN RETURN jsonb_build_object('state','BUSY'); END IF;
 INSERT INTO app_private.schedule_jobs(job_key) VALUES(key_value) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM app_private.schedule_jobs WHERE job_key=key_value FOR UPDATE;
 IF NOT j.done THEN
  FOR sid IN SELECT s.id FROM app.schedule_series s JOIN app.children c ON c.id=s.child_id
   JOIN app.families f ON f.id=c.family_id
   WHERE s.last_date>=(now() AT TIME ZONE 'Asia/Seoul')::date AND c.status='ACTIVE' AND f.status='ACTIVE'
    AND EXISTS(SELECT 1 FROM app.child_consents co WHERE co.child_id=c.id AND co.purpose='general' AND co.revoked_at IS NULL)
    AND (j.cursor_id IS NULL OR s.id>j.cursor_id) ORDER BY s.id LIMIT 50 LOOP
   PERFORM app_private.expand_schedule(sid);j.cursor_id:=sid;n:=n+1;
  END LOOP;
  UPDATE app_private.schedule_jobs SET cursor_id=j.cursor_id,done=n<50,updated_at=now() WHERE job_key=key_value;
 END IF;
 DELETE FROM app_private.schedule_previews WHERE id IN (SELECT id FROM app_private.schedule_previews WHERE expires_at<=now() LIMIT 500);
 DELETE FROM app_private.schedule_idempotency WHERE (actor_id,key) IN (SELECT actor_id,key FROM app_private.schedule_idempotency WHERE expires_at<=now() LIMIT 500);
 DELETE FROM app_private.schedule_jobs WHERE job_key IN (SELECT job_key FROM app_private.schedule_jobs WHERE done AND updated_at<now()-interval '7 days' LIMIT 200);
 DELETE FROM app_private.holiday_sync_runs WHERE ctid IN (SELECT ctid FROM app_private.holiday_sync_runs WHERE run_date<(now() AT TIME ZONE 'Asia/Seoul')::date-7 AND (state<>'LEASED' OR lease_until<=now()) LIMIT 200);
 RETURN jsonb_build_object('processed',n,'done',j.done OR n<50);
END $$;

CREATE OR REPLACE FUNCTION app_private.daily_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE total integer;BEGIN
 UPDATE app_private.daily_jobs j SET state='CANCELLED',finished_at=now() WHERE j.id IN (SELECT id FROM app_private.daily_jobs WHERE state='PENDING' ORDER BY available_at,id LIMIT 500) AND state='PENDING' AND (
  NOT EXISTS(SELECT 1 FROM app.children c JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL WHERE c.id=j.child_id AND c.status='ACTIVE') OR
  j.kind='TASK_DUE' AND NOT EXISTS(SELECT 1 FROM app.tasks t WHERE t.id=j.target_id AND t.version=j.resource_version AND t.state='OPEN') OR
  j.kind='MISSING_ARRIVAL' AND NOT EXISTS(SELECT 1 FROM app.occurrences o WHERE o.id=j.target_id AND o.version=j.resource_version AND o.status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM app.checkins c WHERE c.occurrence_id=o.id AND c.kind='ARRIVED' AND c.voided_at IS NULL)));
 INSERT INTO app_private.daily_jobs(child_id,target_id,kind,resource_version,available_at)
 SELECT o.child_id,o.id,'MISSING_ARRIVAL',o.version,o.starts_at+interval '10 minutes' FROM app.occurrences o
 JOIN app.children c ON c.id=o.child_id AND c.status='ACTIVE' JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL
 WHERE o.status='SCHEDULED' AND o.starts_at>now()-interval '1 day' AND o.starts_at<now()+interval '2 days'
 AND NOT EXISTS(SELECT 1 FROM app.checkins ci WHERE ci.occurrence_id=o.id AND ci.kind='ARRIVED' AND ci.voided_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM app_private.daily_jobs j WHERE j.target_id=o.id AND j.kind='MISSING_ARRIVAL' AND j.resource_version=o.version)
 ORDER BY o.starts_at,o.id LIMIT 500 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS total=ROW_COUNT;
 RETURN jsonb_build_object('reserved',total,'delivery','IN_APP');
END $$;
CREATE OR REPLACE FUNCTION app_private.notification_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j app_private.daily_jobs%ROWTYPE;total integer:=0;processed integer:=0;expired integer:=0;skipped integer:=0;valid boolean;
BEGIN
 FOR j IN SELECT * FROM app_private.daily_jobs WHERE state='PENDING' AND available_at<=now() ORDER BY available_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  valid:=j.available_at>now()-interval '1 hour' AND EXISTS(SELECT 1 FROM app.children c JOIN app.child_consents cc ON cc.child_id=c.id AND cc.purpose='general' AND cc.revoked_at IS NULL WHERE c.id=j.child_id AND c.status='ACTIVE' AND EXISTS(SELECT 1 FROM app.families f WHERE f.id=c.family_id AND f.status='ACTIVE'));
  IF j.kind='TASK_DUE' THEN valid:=valid AND EXISTS(SELECT 1 FROM app.tasks t WHERE t.id=j.target_id AND t.version=j.resource_version AND t.state='OPEN');
  ELSIF j.kind='MISSING_ARRIVAL' THEN valid:=valid AND EXISTS(SELECT 1 FROM app.occurrences o WHERE o.id=j.target_id AND o.version=j.resource_version AND o.status='SCHEDULED' AND o.ends_at>now() AND NOT o.holiday_review_required
   AND (EXISTS(SELECT 1 FROM app.occurrence_exceptions ex WHERE ex.occurrence_id=o.id AND ex.decision='KEEP') OR
    app_private.holiday_state(extract(year FROM o.actual_date)::integer)='READY' AND o.holiday_version=(SELECT version FROM app_private.holiday_years WHERE year=extract(year FROM o.actual_date)::integer)) AND NOT EXISTS(SELECT 1 FROM app.checkins ci WHERE ci.occurrence_id=o.id AND ci.kind='ARRIVED' AND ci.voided_at IS NULL));
  ELSE valid:=false; -- PICKUP_CHANGED is already emitted transactionally by its event trigger.
  END IF;
  IF valid THEN PERFORM app_private.notification_emit(j.id,j.child_id,'daily',j.kind,j.target_id,NULL);total:=total+1;END IF;
  UPDATE app_private.daily_jobs SET state=CASE WHEN j.available_at<=now()-interval '1 hour' THEN 'EXPIRED' WHEN valid THEN 'DONE' ELSE 'SKIPPED' END,finished_at=now() WHERE id=j.id;
  processed:=processed+1;IF j.available_at<=now()-interval '1 hour' THEN expired:=expired+1;ELSIF NOT valid THEN skipped:=skipped+1;END IF;
 END LOOP;
 RETURN jsonb_build_object('inboxJobs',total,'processed',processed,'expired',expired,'skipped',skipped,'backlog',EXISTS(SELECT 1 FROM app_private.daily_jobs WHERE state='PENDING' AND available_at<=now()),'push','NOT_CONNECTED','realtime','NOT_CONNECTED');
END $$;
CREATE OR REPLACE FUNCTION app_private.expire_family_secrets() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE app_private.device_pairings SET sealed_response=NULL WHERE id IN (SELECT id FROM app_private.device_pairings WHERE retry_until<=now() AND sealed_response IS NOT NULL LIMIT 200);
 UPDATE app_private.device_pairings SET state='REVOKED',sealed_response=NULL WHERE id IN (SELECT id FROM app_private.device_pairings WHERE expires_at<=now() AND state IN ('WAITING','APPROVED') LIMIT 200);
 DELETE FROM app_private.device_pairings WHERE id IN (SELECT id FROM app_private.device_pairings WHERE expires_at<now()-interval '1 day' AND coalesce(retry_until,expires_at)<=now() LIMIT 200);
 DELETE FROM app_private.consent_proofs WHERE id IN (SELECT id FROM app_private.consent_proofs WHERE expires_at<now() OR draft_id IN (SELECT id FROM app_private.child_registration_drafts WHERE expires_at<now()) LIMIT 200);
 DELETE FROM app_private.child_registration_drafts d WHERE id IN (SELECT id FROM app_private.child_registration_drafts WHERE expires_at<now() AND state<>'ACTIVATED' LIMIT 200) AND NOT EXISTS(SELECT 1 FROM app_private.consent_proofs p WHERE p.draft_id=d.id);
 UPDATE app_private.child_registration_drafts SET birth_date=NULL,subject_ref=NULL,evidence_ref=NULL WHERE id IN (SELECT id FROM app_private.child_registration_drafts WHERE state='ACTIVATED' AND expires_at<now() AND (birth_date IS NOT NULL OR subject_ref IS NOT NULL OR evidence_ref IS NOT NULL) LIMIT 200);
 DELETE FROM app_private.invites WHERE id IN (SELECT id FROM app_private.invites WHERE expires_at<now()-interval '1 day' LIMIT 200);
END $$;
CREATE OR REPLACE FUNCTION app_private.message_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n integer;BEGIN
 DELETE FROM app.messages WHERE id IN (SELECT id FROM app.messages WHERE created_at<=now()-interval '90 days' ORDER BY created_at LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM app_private.message_receipts WHERE id IN (SELECT id FROM app_private.message_receipts WHERE expires_at<=now() LIMIT 200);
 DELETE FROM app_private.message_keys WHERE ctid IN (SELECT ctid FROM app_private.message_keys WHERE expires_at<=now() LIMIT 200);
 UPDATE app_private.message_jobs SET state='EXPIRED' WHERE id IN (SELECT id FROM app_private.message_jobs WHERE state='PENDING' AND created_at<=now()-interval '24 hours' LIMIT 200);
 DELETE FROM app_private.message_jobs WHERE id IN (SELECT id FROM app_private.message_jobs WHERE state<>'PENDING' AND created_at<=now()-interval '7 days' LIMIT 200);
 RETURN jsonb_build_object('expired',n,'delivery','NOT_CONNECTED');
END $$;
CREATE FUNCTION app_private.retention_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE day_key text:='retention:'||(now() AT TIME ZONE 'Asia/Seoul')::date; j app_private.schedule_jobs%ROWTYPE;
 n integer; total integer:=0; complete boolean:=true; counts jsonb:='{}';
BEGIN
 INSERT INTO app_private.schedule_jobs(job_key) VALUES(day_key) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM app_private.schedule_jobs WHERE job_key=day_key FOR UPDATE;
 IF j.done THEN RETURN jsonb_build_object('state','ALREADY_DONE','processed',0);END IF;
 DELETE FROM app.checkins WHERE ctid IN (SELECT ctid FROM app.checkins WHERE greatest(happened_at,created_at)<=now()-interval '90 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('checkins',n);
 DELETE FROM app.learning_entries WHERE ctid IN (SELECT ctid FROM app.learning_entries WHERE created_at<=now()-interval '90 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('learning_entries',n);
 DELETE FROM app.pickups WHERE ctid IN (SELECT ctid FROM app.pickups WHERE closed_at<=now()-interval '90 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('pickups',n);
 DELETE FROM app_private.notifications WHERE ctid IN (SELECT ctid FROM app_private.notifications WHERE created_at<=now()-interval '30 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('notifications',n);
 DELETE FROM app_private.daily_jobs WHERE ctid IN (SELECT ctid FROM app_private.daily_jobs WHERE finished_at<=now()-interval '7 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('daily_jobs',n);
 DELETE FROM app_private.daily_events WHERE ctid IN (SELECT ctid FROM app_private.daily_events WHERE created_at<=now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM app.pickups WHERE id=target_id) LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('daily_events',n);
 DELETE FROM app_private.schedule_events WHERE ctid IN (SELECT ctid FROM app_private.schedule_events WHERE created_at<=now()-interval '90 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('schedule_events',n);
 DELETE FROM app_private.daily_idempotency WHERE ctid IN (SELECT ctid FROM app_private.daily_idempotency WHERE expires_at<=now() LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('daily_idempotency',n);
 DELETE FROM app_private.schedule_idempotency WHERE ctid IN (SELECT ctid FROM app_private.schedule_idempotency WHERE expires_at<=now() LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('schedule_idempotency',n);
 DELETE FROM app_private.schedule_previews WHERE ctid IN (SELECT ctid FROM app_private.schedule_previews WHERE expires_at<=now() LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('schedule_previews',n);
 DELETE FROM app_private.schedule_template_previews WHERE ctid IN (SELECT ctid FROM app_private.schedule_template_previews WHERE expires_at<=now() LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('schedule_template_previews',n);
 DELETE FROM app_private.cron_runs WHERE ctid IN (SELECT ctid FROM app_private.cron_runs WHERE finished_at<=now()-interval '7 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('cron_runs',n);
 DELETE FROM app_private.holiday_sync_runs WHERE ctid IN (SELECT ctid FROM app_private.holiday_sync_runs WHERE run_date<(now() AT TIME ZONE 'Asia/Seoul')::date-7 AND (state<>'LEASED' OR lease_until<=now()) LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('holiday_sync_runs',n);
 DELETE FROM app_private.schedule_jobs WHERE ctid IN (SELECT ctid FROM app_private.schedule_jobs WHERE updated_at<=now()-interval '7 days' LIMIT 200);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('schedule_jobs',n);
 -- Detach retained learning records before deleting expired closed tasks.
 WITH batch AS (SELECT id FROM app.tasks WHERE closed_at<=now()-interval '90 days' ORDER BY closed_at,id LIMIT 200), detached AS (UPDATE app.learning_entries SET task_id=NULL WHERE task_id IN (SELECT id FROM batch))
 DELETE FROM app.tasks WHERE id IN (SELECT id FROM batch);GET DIAGNOSTICS n=ROW_COUNT;
 total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('tasks',n);
 -- Remove ended occurrences after dependent records have reached their own retention window.
 DELETE FROM app_private.schedule_previews WHERE occurrence_id IN (SELECT id FROM app.occurrences WHERE ends_at<=now()-interval '90 days' LIMIT 200);
 DELETE FROM app.occurrence_exceptions WHERE occurrence_id IN (SELECT id FROM app.occurrences WHERE ends_at<=now()-interval '90 days' LIMIT 200);
 UPDATE app.schedule_series SET makeup_for_occurrence_id=NULL WHERE id IN (SELECT s.id FROM app.schedule_series s JOIN app.occurrences o ON o.id=s.makeup_for_occurrence_id WHERE o.ends_at<=now()-interval '90 days' LIMIT 200);
 DELETE FROM app.occurrences o WHERE id IN (SELECT id FROM app.occurrences WHERE ends_at<=now()-interval '90 days' LIMIT 200)
 AND NOT EXISTS(SELECT 1 FROM app.checkins c WHERE c.occurrence_id=o.id) AND NOT EXISTS(SELECT 1 FROM app.pickups p WHERE p.occurrence_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM app.schedule_series s WHERE s.makeup_for_occurrence_id=o.id);
 GET DIAGNOSTICS n=ROW_COUNT;total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('occurrences',n);
 -- An ended series can leave only metadata once all retained occurrences are gone.
 DELETE FROM app.schedule_closures WHERE series_id IN (SELECT s.id FROM app.schedule_series s WHERE s.last_date<(now() AT TIME ZONE 'Asia/Seoul')::date-90 AND NOT EXISTS(SELECT 1 FROM app.occurrences o WHERE o.series_id=s.id) ORDER BY s.id LIMIT 200);
 DELETE FROM app.schedule_series_versions WHERE series_id IN (SELECT s.id FROM app.schedule_series s WHERE s.last_date<(now() AT TIME ZONE 'Asia/Seoul')::date-90 AND NOT EXISTS(SELECT 1 FROM app.occurrences o WHERE o.series_id=s.id) ORDER BY s.id LIMIT 200);
 DELETE FROM app.schedule_series WHERE id IN (SELECT s.id FROM app.schedule_series s WHERE s.last_date<(now() AT TIME ZONE 'Asia/Seoul')::date-90 AND NOT EXISTS(SELECT 1 FROM app.occurrences o WHERE o.series_id=s.id) ORDER BY s.id LIMIT 200);
 GET DIAGNOSTICS n=ROW_COUNT;total:=total+n;complete:=complete AND n<200;counts:=counts||jsonb_build_object('series',n);
 UPDATE app_private.schedule_jobs SET done=complete,updated_at=now() WHERE job_key=day_key;
 RETURN jsonb_build_object('state',CASE WHEN complete THEN 'DONE' ELSE 'MORE' END,'processed',total,'counts',counts);
END $$;
CREATE FUNCTION app_private.cron_step(lease uuid,step text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM 1 FROM app_private.cron_runs WHERE token=lease AND state='RUNNING' AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_LEASE';END IF;
 CASE step
 WHEN 'holiday_status' THEN RETURN (SELECT jsonb_build_object('years',jsonb_agg(jsonb_build_object('year',y,'state',app_private.holiday_state(y),'lastSuccessAt',h.last_success_at))) FROM (SELECT DISTINCT extract(year FROM d)::integer y FROM (VALUES((now() AT TIME ZONE 'Asia/Seoul')::date),((now() AT TIME ZONE 'Asia/Seoul')::date+55)) dates(d)) years LEFT JOIN app_private.holiday_years h ON h.year=y);
 WHEN 'reserve' THEN RETURN app_private.daily_maintenance();
 WHEN 'notify' THEN RETURN app_private.notification_maintenance();
 WHEN 'expand' THEN RETURN app_private.schedule_maintenance();
 WHEN 'messages' THEN RETURN app_private.message_maintenance();
 WHEN 'retention' THEN RETURN app_private.retention_maintenance();
 WHEN 'secrets' THEN PERFORM app_private.expire_family_secrets();RETURN jsonb_build_object('state','DONE');
 ELSE RAISE EXCEPTION 'INVALID_STEP';END CASE;
END $$;
REVOKE ALL ON FUNCTION app_private.cron_claim(text),app_private.cron_finish(uuid,jsonb,text),app_private.cron_step(uuid,text),app_private.retention_maintenance() FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.cron_claim(text),app_private.cron_finish(uuid,jsonb,text),app_private.cron_step(uuid,text) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

