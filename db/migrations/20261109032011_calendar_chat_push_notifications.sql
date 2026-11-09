-- Opt-in Web Push. Only calendar EVENT and CHAT records are eligible.
-- No historic notifications are backfilled. Memo data is deliberately retained.
SELECT set_config('iharu.migration_executor',current_user,true);
CREATE TABLE app_private.workspace_push_preferences (
 profile_id uuid PRIMARY KEY REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 calendar_changes boolean NOT NULL DEFAULT true,
 calendar_reminders boolean NOT NULL DEFAULT true,
 chat boolean NOT NULL DEFAULT true,
 reminder_minutes integer NOT NULL DEFAULT 10 CHECK(reminder_minutes IN (0,5,10,30,60,1440,10080)),
 preview boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.workspace_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint)<=2048),
 p256dh text NOT NULL, auth text NOT NULL,
 session_id text, workspace_session_id uuid REFERENCES app_private.workspace_sessions(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(session_id,workspace_session_id)=1)
);
CREATE INDEX workspace_push_profile ON app_private.workspace_push_subscriptions(profile_id) WHERE enabled;
CREATE TABLE app_private.workspace_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES app_private.workspace_push_subscriptions(id) ON DELETE CASCADE,
 item_id uuid REFERENCES app_private.workspace_items(id) ON DELETE CASCADE,
 item_version integer, reason text NOT NULL CHECK(reason IN ('calendar-change','calendar-reminder','chat','test')),
 dedupe_key text NOT NULL, menu_revision bigint NOT NULL DEFAULT 0,
 family_id uuid, recipient_link integer, author_link integer,
 due_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
 last_status integer, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(subscription_id,dedupe_key)
);
CREATE INDEX workspace_push_due ON app_private.workspace_push_outbox(due_at) WHERE state IN ('pending','leased');
CREATE TABLE app_private.workspace_push_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), secret_hash text NOT NULL CHECK(length(secret_hash)=64)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_push_preferences','workspace_push_subscriptions','workspace_push_outbox','workspace_push_config'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY push_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

CREATE FUNCTION app_private.workspace_push_occurs(d jsonb,day date) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT day>=(d->>'date')::date AND (coalesce(d->>'calendarFrequency','ONCE')='ONCE' OR day<=coalesce(nullif(d->>'untilDate','')::date,'9999-12-31'::date)) AND CASE coalesce(d->>'calendarFrequency','ONCE')
 WHEN 'ONCE' THEN day=(d->>'date')::date WHEN 'DAILY' THEN true
 WHEN 'WEEKLY' THEN d->'weekdays' @> to_jsonb(ARRAY[extract(dow FROM day)::int])
 WHEN 'MONTHLY' THEN extract(day FROM day)=least(extract(day FROM (d->>'date')::date),extract(day FROM (date_trunc('month',day)+interval '1 month - 1 day')))
 WHEN 'YEARLY' THEN extract(month FROM day)=extract(month FROM (d->>'date')::date) AND extract(day FROM day)=least(extract(day FROM (d->>'date')::date),extract(day FROM (date_trunc('month',day)+interval '1 month - 1 day')))
 ELSE false END
$$;
REVOKE ALL ON FUNCTION app_private.workspace_push_occurs(jsonb,date) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_push_session(s app_private.workspace_push_subscriptions) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.enabled AND EXISTS(SELECT 1 FROM app_private.workspace_profiles p WHERE p.id=s.profile_id AND (
  (p.kind='PARENT' AND EXISTS(SELECT 1 FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
   JOIN iharu_auth.session a ON a."userId"=u.id JOIN iharu_auth.session_guard g ON g.session_id=a.id
   WHERE m.id=p.member_id AND m.status='ACTIVE' AND u."emailVerified" AND u.email NOT LIKE '%@identity.iharu.invalid'
   AND a.id=s.session_id AND g.assurance='HIGH' AND a."expiresAt">now() AND g.absolute_expires_at>now() AND g.last_seen_at>now()-interval '7 days'))
  OR (p.kind='CHILD' AND NOT EXISTS(SELECT 1 FROM app_private.system_member_controls c WHERE c.target_id=p.child_account_id AND c.suspended)
   AND EXISTS(SELECT 1 FROM app_private.workspace_sessions a WHERE a.id=s.workspace_session_id AND a.profile_id=p.id AND a.revoked_at IS NULL AND a.expires_at>now() AND a.last_seen_at>now()-interval '7 days'))))
$$;
CREATE FUNCTION app_private.workspace_push_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.kind NOT IN ('EVENT','CHAT') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.kind='CHAT' OR (NEW.version=OLD.version AND NEW.data=OLD.data AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at) THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO app_private.workspace_push_outbox(subscription_id,item_id,item_version,reason,dedupe_key,expires_at,menu_revision,family_id,recipient_link,author_link)
 SELECT s.id,NEW.id,NEW.version,CASE NEW.kind WHEN 'CHAT' THEN 'chat' ELSE 'calendar-change' END,
 NEW.kind||':'||NEW.id||':'||NEW.version,now()+interval '15 minutes',coalesce(u.revision,0),r.family_id,r.version,a.version
 FROM app_private.workspace_push_subscriptions s
 JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id
 JOIN app_private.workspace_links r ON r.profile_id=s.profile_id AND r.active
 JOIN app_private.workspace_links a ON a.profile_id=NEW.owner_id AND a.family_id=r.family_id AND a.active
 LEFT JOIN app_private.workspace_menu_updates u ON u.profile_id=s.profile_id AND u.menu=CASE NEW.kind WHEN 'CHAT' THEN 'chat' ELSE 'calendar' END
 WHERE s.profile_id<>NEW.owner_id AND s.profile_id IS DISTINCT FROM app_private.workspace_actor() AND app_private.workspace_push_session(s)
 AND CASE NEW.kind WHEN 'CHAT' THEN p.chat ELSE p.calendar_changes END
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;

-- New commands share the existing authenticated workspace boundary.
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v108;
REVOKE ALL ON FUNCTION app_private.workspace_command_v108(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE who uuid; identity jsonb; result jsonb; sid uuid; wsid uuid; prefs app_private.workspace_push_preferences;
BEGIN
 IF op NOT LIKE 'workspace.push.%' THEN RETURN app_private.workspace_command_v108(op,p); END IF;
 identity:=app_private.workspace_command_v108('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 INSERT INTO app_private.workspace_push_preferences(profile_id) VALUES(who) ON CONFLICT DO NOTHING;
 IF op='workspace.push.settings.save' THEN
  IF jsonb_typeof(p->'calendarChanges')<>'boolean' OR jsonb_typeof(p->'calendarReminders')<>'boolean' OR jsonb_typeof(p->'chat')<>'boolean' OR jsonb_typeof(p->'preview')<>'boolean' OR (p->>'reminderMinutes')::int NOT IN (0,5,10,30,60,1440,10080) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  UPDATE app_private.workspace_push_outbox SET state='cancelled',finished_at=now() WHERE subscription_id IN(SELECT id FROM app_private.workspace_push_subscriptions WHERE profile_id=who) AND reason='calendar-reminder' AND state IN('pending','leased') AND (SELECT reminder_minutes FROM app_private.workspace_push_preferences WHERE profile_id=who)<>(p->>'reminderMinutes')::int;
  UPDATE app_private.workspace_push_preferences SET calendar_changes=(p->>'calendarChanges')::boolean,calendar_reminders=(p->>'calendarReminders')::boolean,chat=(p->>'chat')::boolean,preview=(p->>'preview')::boolean,reminder_minutes=(p->>'reminderMinutes')::int,updated_at=now() WHERE profile_id=who;
 ELSIF op='workspace.push.subscribe' THEN
  IF length(p->>'endpoint') NOT BETWEEN 20 AND 2048 OR p->>'endpoint' !~ '^https://' OR p->>'p256dh' !~ '^[A-Za-z0-9_-]{87}=?$' OR p->>'auth' !~ '^[A-Za-z0-9_-]{22}={0,2}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT id INTO wsid FROM app_private.workspace_sessions WHERE token_hash=nullif(current_setting('iharu.workspace_hash',true),'') AND profile_id=who AND revoked_at IS NULL AND expires_at>now();
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,109));
  IF (SELECT count(*) FROM app_private.workspace_push_subscriptions WHERE profile_id=who AND enabled AND endpoint<>p->>'endpoint')>=10 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
  -- Rebinding an endpoint discards former-account deliveries before ownership changes.
  DELETE FROM app_private.workspace_push_outbox WHERE subscription_id IN(SELECT id FROM app_private.workspace_push_subscriptions WHERE endpoint=p->>'endpoint');
  INSERT INTO app_private.workspace_push_subscriptions(profile_id,endpoint,p256dh,auth,session_id,workspace_session_id)
  VALUES(who,p->>'endpoint',p->>'p256dh',p->>'auth',CASE WHEN wsid IS NULL THEN nullif(current_setting('iharu.session_id',true),'') END,wsid)
  ON CONFLICT(endpoint) DO UPDATE SET profile_id=who,p256dh=excluded.p256dh,auth=excluded.auth,session_id=excluded.session_id,workspace_session_id=excluded.workspace_session_id,enabled=true,created_at=now(),updated_at=now() RETURNING id INTO sid;
 ELSIF op IN ('workspace.push.unsubscribe','workspace.push.test') THEN
  SELECT id INTO sid FROM app_private.workspace_push_subscriptions WHERE endpoint=p->>'endpoint' AND profile_id=who AND enabled;
  IF op='workspace.push.unsubscribe' THEN
   UPDATE app_private.workspace_push_subscriptions SET enabled=false,updated_at=now() WHERE id=sid;
   UPDATE app_private.workspace_push_outbox SET state='cancelled',finished_at=now() WHERE subscription_id=sid AND state IN ('pending','leased');
  ELSIF sid IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM app_private.workspace_push_outbox WHERE subscription_id=sid AND reason='test' AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
   INSERT INTO app_private.workspace_push_outbox(subscription_id,reason,dedupe_key,expires_at) VALUES(sid,'test',gen_random_uuid()::text,now()+interval '5 minutes');
  ELSE RAISE EXCEPTION 'NOT_FOUND'; END IF;
 ELSIF op<>'workspace.push.settings' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT * INTO prefs FROM app_private.workspace_push_preferences WHERE profile_id=who;
 RETURN jsonb_build_object('profileId',who,'calendarChanges',prefs.calendar_changes,'calendarReminders',prefs.calendar_reminders,'chat',prefs.chat,'reminderMinutes',prefs.reminder_minutes,'preview',prefs.preview,
 'deviceEnabled',EXISTS(SELECT 1 FROM app_private.workspace_push_subscriptions s WHERE s.profile_id=who AND s.endpoint=p->>'endpoint' AND app_private.workspace_push_session(s)),
 'deviceCount',(SELECT count(*) FROM app_private.workspace_push_subscriptions s WHERE s.profile_id=who AND app_private.workspace_push_session(s)));
END $$;

CREATE FUNCTION app_private.workspace_push_valid(q app_private.workspace_push_outbox,s app_private.workspace_push_subscriptions) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.workspace_push_session(s) AND q.expires_at>now() AND (q.reason='test' OR EXISTS(
 SELECT 1 FROM app_private.workspace_items i JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id
 WHERE i.id=q.item_id AND i.version=q.item_version AND app_private.workspace_can_read(s.profile_id,i.owner_id)
 AND (q.reason='calendar-change' OR i.deleted_at IS NULL)
 AND CASE q.reason WHEN 'chat' THEN i.kind='CHAT' AND p.chat WHEN 'calendar-change' THEN i.kind='EVENT' AND p.calendar_changes WHEN 'calendar-reminder' THEN i.kind='EVENT' AND p.calendar_reminders ELSE false END
 AND (i.owner_id=s.profile_id OR EXISTS(SELECT 1 FROM app_private.workspace_links r JOIN app_private.workspace_links a ON a.family_id=r.family_id AND a.profile_id=i.owner_id AND a.active AND a.version=q.author_link WHERE r.profile_id=s.profile_id AND r.active AND r.family_id=q.family_id AND r.version=q.recipient_link))
 AND (q.reason NOT IN ('chat','calendar-change') OR q.menu_revision=0 OR NOT EXISTS(SELECT 1 FROM app_private.workspace_menu_updates u WHERE u.profile_id=s.profile_id AND u.menu=CASE q.reason WHEN 'chat' THEN 'chat' ELSE 'calendar' END AND u.seen_revision>=q.menu_revision))
 ))
$$;

-- Only the server-held worker secret authorizes background access. No browser command can call this.
CREATE FUNCTION app_private.workspace_push_worker(secret text,op text,p jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; job_row app_private.workspace_push_outbox; device_row app_private.workspace_push_subscriptions; pref app_private.workspace_push_preferences; item app_private.workspace_items; n integer;
BEGIN
 IF length(secret)<32 OR NOT EXISTS(SELECT 1 FROM app_private.workspace_push_config WHERE singleton AND secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF op='plan' THEN
  -- Compute just-due occurrences in Asia/Seoul. Month-end and leap-day clamp identically to the calendar.
  INSERT INTO app_private.workspace_push_outbox(subscription_id,item_id,item_version,reason,dedupe_key,due_at,expires_at,family_id,recipient_link,author_link)
  SELECT s.id,i.id,i.version,'calendar-reminder','reminder:'||i.id||':'||d.day||':'||p.reminder_minutes,t.due,t.due+interval '15 minutes',r.family_id,r.version,a.version
  FROM app_private.workspace_push_subscriptions s JOIN app_private.workspace_push_preferences p ON p.profile_id=s.profile_id AND p.calendar_reminders
  JOIN app_private.workspace_items i ON i.kind='EVENT' AND i.deleted_at IS NULL AND app_private.workspace_can_read(s.profile_id,i.owner_id)
  LEFT JOIN app_private.workspace_links r ON r.profile_id=s.profile_id AND r.active
  LEFT JOIN app_private.workspace_links a ON a.profile_id=i.owner_id AND a.family_id=r.family_id AND a.active
  CROSS JOIN LATERAL (SELECT ((now()+make_interval(mins=>p.reminder_minutes)) AT TIME ZONE 'Asia/Seoul')::date + z AS day FROM generate_series(-1,0) z) d
  CROSS JOIN LATERAL (SELECT (d.day+CASE WHEN coalesce((i.data->>'allDay')::boolean,false) THEN time '09:00' ELSE coalesce(nullif(i.data->>'startTime','')::time,time '09:00') END) AT TIME ZONE 'Asia/Seoul'-make_interval(mins=>p.reminder_minutes) AS due) t
  WHERE app_private.workspace_push_session(s) AND t.due<=now() AND t.due>now()-interval '15 minutes' AND t.due>=s.created_at
  AND app_private.workspace_push_occurs(i.data,d.day)
  ON CONFLICT(subscription_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  DELETE FROM app_private.workspace_push_outbox WHERE created_at<now()-interval '7 days';
  DELETE FROM app_private.workspace_push_subscriptions WHERE NOT enabled AND updated_at<now()-interval '30 days';
  RETURN jsonb_build_object('planned',n);
 ELSIF op='claim' THEN
  UPDATE app_private.workspace_push_outbox SET state='failed',finished_at=now() WHERE state='leased' AND attempts>=5 AND lease_until<now();
  UPDATE app_private.workspace_push_outbox q SET state='cancelled',finished_at=now() FROM app_private.workspace_push_subscriptions s WHERE s.id=q.subscription_id AND q.state IN ('pending','leased') AND NOT app_private.workspace_push_valid(q,s);
  WITH candidates AS (SELECT id FROM app_private.workspace_push_outbox WHERE due_at<=now() AND expires_at>now() AND attempts<5 AND (state='pending' OR (state='leased' AND lease_until<now())) ORDER BY due_at,id LIMIT least(greatest(coalesce((p->>'limit')::int,20),1),50) FOR UPDATE SKIP LOCKED),
  leased AS (UPDATE app_private.workspace_push_outbox SET state='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' WHERE id IN(SELECT id FROM candidates) RETURNING id,lease_token)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'leaseToken',lease_token)),'[]') INTO result FROM leased;
  RETURN result;
 ELSIF op='delivery' THEN
  SELECT * INTO job_row FROM app_private.workspace_push_outbox WHERE id=(p->>'id')::uuid AND lease_token=(p->>'leaseToken')::uuid AND state='leased' AND lease_until>now();
  IF NOT FOUND THEN RETURN 'null'; END IF;
  SELECT * INTO device_row FROM app_private.workspace_push_subscriptions WHERE id=job_row.subscription_id;
  IF NOT app_private.workspace_push_valid(job_row,device_row) THEN UPDATE app_private.workspace_push_outbox SET state='cancelled',finished_at=now() WHERE id=job_row.id;RETURN 'null'; END IF;
  SELECT * INTO pref FROM app_private.workspace_push_preferences WHERE profile_id=device_row.profile_id;
  SELECT * INTO item FROM app_private.workspace_items WHERE id=job_row.item_id;
  RETURN jsonb_build_object('subscription',jsonb_build_object('endpoint',device_row.endpoint,'keys',jsonb_build_object('p256dh',device_row.p256dh,'auth',device_row.auth)),
   'payload',jsonb_build_object('title',CASE job_row.reason WHEN 'chat' THEN '아이하루 · 새 대화' WHEN 'calendar-reminder' THEN '아이하루 · 일정 알림' WHEN 'calendar-change' THEN '아이하루 · 달력 업데이트' ELSE '아이하루 · 알림 연결 완료' END,
   'body',CASE WHEN pref.preview AND item.deleted_at IS NULL AND item.id IS NOT NULL THEN left(CASE WHEN job_row.reason='chat' THEN item.data->>'note' ELSE item.data->>'title' END,100) ELSE CASE job_row.reason WHEN 'chat' THEN '가족이 보낸 새 대화를 확인해 주세요.' WHEN 'calendar-reminder' THEN '예정된 달력 일정을 확인해 주세요.' WHEN 'calendar-change' THEN '가족 달력의 일정이 변경되었어요.' ELSE '이 기기에서 달력과 대화 알림을 받을 수 있어요.' END END,
   'url',CASE WHEN job_row.reason='chat' THEN '/chat' WHEN job_row.reason='test' THEN '/notification-settings' ELSE '/today/calendar' END,
   'tag',CASE WHEN job_row.reason='chat' THEN 'iharu-chat' ELSE 'iharu-'||job_row.id END,'profileId',device_row.profile_id,'expiresAt',job_row.expires_at),
   'ttl',greatest(1,extract(epoch FROM(job_row.expires_at-now()))::int));
 ELSIF op='complete' THEN
  SELECT * INTO job_row FROM app_private.workspace_push_outbox WHERE id=(p->>'id')::uuid AND lease_token=(p->>'leaseToken')::uuid AND state='leased' FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  n:=(p->>'status')::int;
  IF n IN(404,410) THEN UPDATE app_private.workspace_push_subscriptions SET enabled=false,updated_at=now() WHERE id=job_row.subscription_id; END IF;
  UPDATE app_private.workspace_push_outbox SET last_status=n,lease_until=NULL,
   state=CASE WHEN n BETWEEN 200 AND 299 THEN 'sent' WHEN n IN(404,410) OR job_row.attempts>=5 OR (n BETWEEN 400 AND 499 AND n<>429) THEN 'failed' ELSE 'pending' END,
   due_at=CASE WHEN n=429 THEN greatest(now()+interval '1 minute',now()+make_interval(secs=>least(greatest(coalesce((p->>'retryAfter')::int,60),60),900))) ELSE now()+make_interval(secs=>least(600,15*(2^job_row.attempts)::int)) END,
   finished_at=CASE WHEN n BETWEEN 200 AND 299 OR n IN(404,410) OR job_row.attempts>=5 OR (n BETWEEN 400 AND 499 AND n<>429) THEN now() END WHERE id=job_row.id;
  RETURN '{}';
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_push_session(app_private.workspace_push_subscriptions),app_private.workspace_push_capture(),app_private.workspace_push_valid(app_private.workspace_push_outbox,app_private.workspace_push_subscriptions),app_private.workspace_push_worker(text,text,jsonb),app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb),app_private.workspace_push_worker(text,text,jsonb) TO app_runtime;
DO $$ BEGIN EXECUTE format('GRANT EXECUTE ON FUNCTION app_private.workspace_push_capture() TO %I',current_setting('iharu.migration_executor')); END $$;
RESET ROLE;
CREATE TRIGGER workspace_push_capture AFTER INSERT OR UPDATE ON app_private.workspace_items FOR EACH ROW EXECUTE FUNCTION app_private.workspace_push_capture();
SET LOCAL ROLE iharu_policy;
DO $$ BEGIN EXECUTE format('REVOKE EXECUTE ON FUNCTION app_private.workspace_push_capture() FROM %I',current_setting('iharu.migration_executor')); END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
