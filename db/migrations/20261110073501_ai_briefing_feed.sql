-- UI139. Private, opt-in briefing; worker capabilities never belong to app_runtime.
ALTER TABLE app_private.workspace_menu_updates DROP CONSTRAINT workspace_menu_updates_menu_check;
ALTER TABLE app_private.workspace_menu_updates ADD CONSTRAINT workspace_menu_updates_menu_check CHECK(menu IN ('timetable','calendar','chat','briefing','fees','records','family'));
CREATE TABLE app_private.briefing_preferences (
 profile_id uuid PRIMARY KEY REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,region text NOT NULL DEFAULT '' CHECK(length(region)<=60),
 consent_version text,version integer NOT NULL DEFAULT 0,enabled_at timestamptz,
 last_checked_at timestamptz,last_scan_at timestamptz,last_state text,new_content_count integer NOT NULL DEFAULT 0
);
CREATE TABLE app_private.briefing_system (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT true,
 model text NOT NULL DEFAULT 'gpt-5.6-luna' CHECK(model IN ('gpt-5.6-luna','gpt-5.6-terra')),
 daily_call_limit integer NOT NULL DEFAULT 100 CHECK(daily_call_limit BETWEEN 2 AND 1000),version integer NOT NULL DEFAULT 0
);
INSERT INTO app_private.briefing_system(id) VALUES(true);
CREATE TABLE app_private.briefing_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 day date NOT NULL,kind text NOT NULL CHECK(kind IN ('REGULAR','URGENT')),region text NOT NULL,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 3),
 owners uuid[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(profile_id,day,kind)
);
CREATE INDEX briefing_posts_feed ON app_private.briefing_posts(profile_id,updated_at DESC,id DESC);
CREATE TABLE app_private.briefing_feedback (
 post_id uuid PRIMARY KEY REFERENCES app_private.briefing_posts(id) ON DELETE CASCADE,
 saved boolean NOT NULL DEFAULT false,helpful boolean NOT NULL DEFAULT false,hidden boolean NOT NULL DEFAULT false
);
CREATE TABLE app_private.briefing_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 day date NOT NULL,phase text NOT NULL DEFAULT 'SEARCH' CHECK(phase IN ('SEARCH','ANALYZE')),
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','LEASED','DONE','ERROR','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0,token uuid,lease_until timestamptz,retry_at timestamptz NOT NULL DEFAULT now(),
 preference_version integer NOT NULL,system_version integer,credential_version integer,
 context jsonb,research jsonb,scope_hash text,error_code text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(profile_id,day)
);
CREATE INDEX briefing_jobs_queue ON app_private.briefing_jobs(retry_at,created_at) WHERE state IN ('QUEUED','LEASED');
CREATE TABLE app_private.briefing_usage (
 token uuid PRIMARY KEY,job_id uuid REFERENCES app_private.briefing_jobs(id) ON DELETE SET NULL,
 day date NOT NULL,phase text NOT NULL,model text NOT NULL,input_tokens integer NOT NULL DEFAULT 0,output_tokens integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX briefing_usage_day ON app_private.briefing_usage(day);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['briefing_preferences','briefing_system','briefing_posts','briefing_feedback','briefing_jobs','briefing_usage'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY briefing_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime,worker_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.briefing_active(who uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM app_private.workspace_profiles p JOIN iharu_auth.members m ON m.id=p.member_id JOIN iharu_auth."user" u ON u.id=m.auth_user_id
 WHERE p.id=who AND p.kind='PARENT' AND m.status='ACTIVE' AND u."emailVerified"
 AND NOT EXISTS(SELECT 1 FROM app_private.system_member_controls c WHERE c.target_id=m.id AND c.suspended)
 AND (NOT EXISTS(SELECT 1 FROM app_private.legal_publications) OR EXISTS(SELECT 1 FROM app_private.legal_acceptances a WHERE a.member_id=m.id AND a.publication_id=(SELECT id FROM app_private.legal_publications ORDER BY version DESC LIMIT 1) AND a.withdrawn_at IS NULL)))
$$;
CREATE FUNCTION app_private.briefing_can_use(who uuid,author uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.workspace_can_read(who,author) AND (who=author OR EXISTS(
 SELECT 1 FROM app_private.workspace_profiles v JOIN app_private.workspace_profiles a ON a.id=author
 JOIN app_private.child_accounts c ON c.id=a.child_account_id WHERE v.id=who AND c.approved_by=v.member_id))
$$;
CREATE FUNCTION app_private.briefing_context(who uuid,day date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 WITH visible AS (
  SELECT i.* FROM app_private.workspace_items i WHERE i.kind IN ('REPEAT','EVENT') AND i.deleted_at IS NULL
  AND app_private.briefing_can_use(who,i.owner_id)
  AND (i.kind='REPEAT' OR ((i.data->>'date')::date<=day+6 AND
   (coalesce(i.data->>'calendarFrequency','ONCE')<>'ONCE' OR coalesce(nullif(i.data->>'endDate','')::date,(i.data->>'date')::date)>=day)))
  ORDER BY i.updated_at DESC,i.id LIMIT 250
 ), snapshot AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'ownerId',i.owner_id,'kind',i.kind,'version',i.version,
 'data',i.data-ARRAY['note','amount','paid','feePayerId','assigneeId'],'changed',i.updated_at>coalesce(p.last_scan_at,'epoch'::timestamptz)) ORDER BY i.id),'[]'::jsonb) items
 FROM visible i JOIN app_private.briefing_preferences p ON p.profile_id=who
 )
 SELECT jsonb_build_object('region',p.region,'day',day,'items',s.items,
 'names',coalesce((SELECT jsonb_agg(name) FROM app_private.workspace_profiles v WHERE app_private.workspace_can_read(who,v.id)),'[]'::jsonb),
 'owners',coalesce((SELECT jsonb_agg(DISTINCT owner_id) FROM visible),'[]'::jsonb),
 'scope',md5(jsonb_build_object('items',s.items,'region',p.region,'version',p.version,'links',coalesce((SELECT jsonb_agg(jsonb_build_array(l.family_id,l.profile_id,l.version,l.active) ORDER BY l.family_id,l.profile_id) FROM app_private.workspace_links l WHERE l.profile_id=who),'[]'::jsonb))::text))
 FROM app_private.briefing_preferences p CROSS JOIN snapshot s WHERE p.profile_id=who
$$;
CREATE FUNCTION app_private.briefing_post_json(post app_private.briefing_posts) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',post.id,'day',post.day,'kind',post.kind,'region',post.region,
 'items',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(post.items) v WHERE (v->>'validUntil')::date>=(now() AT TIME ZONE 'Asia/Seoul')::date),'[]'::jsonb),
 'createdAt',post.created_at,'updatedAt',post.updated_at,'saved',coalesce(f.saved,false),'helpful',coalesce(f.helpful,false))
 FROM (SELECT 1) x LEFT JOIN app_private.briefing_feedback f ON f.post_id=post.id
$$;
CREATE FUNCTION app_private.briefing_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb;who uuid;pref app_private.briefing_preferences%ROWTYPE;cfg app_private.briefing_system%ROWTYPE;
 post app_private.briefing_posts%ROWTYPE;v integer;results jsonb;has_more boolean;today date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF op IN ('briefing.preferences.save','briefing.admin.save') THEN PERFORM pg_advisory_xact_lock(83002); END IF;
 IF op IN ('briefing.admin.read','briefing.admin.save') THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO cfg FROM app_private.briefing_system WHERE id FOR UPDATE;
  IF op='briefing.admin.save' THEN
   IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
   IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR (p->>'version')::integer<>cfg.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF p-ARRAY['enabled','dailyCallLimit','version']<>'{}' OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR (p->>'dailyCallLimit')::int NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.briefing_system SET enabled=(p->>'enabled')::boolean,daily_call_limit=(p->>'dailyCallLimit')::int,version=version+1 WHERE id RETURNING * INTO cfg;
   INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details) VALUES('ADMIN','admin.ai.briefing.settings',app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,'AI 브리핑 배치 운영 설정',jsonb_build_object('enabled',cfg.enabled,'dailyCallLimit',cfg.daily_call_limit));
  END IF;
  RETURN jsonb_build_object('enabled',cfg.enabled,'model',cfg.model,'dailyCallLimit',cfg.daily_call_limit,'version',cfg.version,
  'callsToday',(SELECT count(*) FROM app_private.briefing_usage WHERE day=today),'queued',(SELECT count(*) FROM app_private.briefing_jobs WHERE state IN ('QUEUED','LEASED')),'failed',(SELECT count(*) FROM app_private.briefing_jobs WHERE state='ERROR' AND day=today));
 END IF;
 identity:=app_private.workspace_command('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL OR NOT app_private.briefing_active(who) THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
 INSERT INTO app_private.briefing_preferences(profile_id) VALUES(who) ON CONFLICT DO NOTHING;
 SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=who FOR UPDATE;
 IF op='briefing.preferences.save' THEN
  IF p-ARRAY['enabled','region','consent','version']<>'{}' OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'region') IS DISTINCT FROM 'string' OR length(p->>'region')>60 OR (p->>'region') !~ '^[가-힣a-zA-Z ·-]*$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR (p->>'version')::int<>pref.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF (p->>'enabled')::boolean AND (p->>'consent' IS DISTINCT FROM 'true' OR length(trim(p->>'region'))<2) THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  UPDATE app_private.briefing_preferences SET enabled=(p->>'enabled')::boolean,region=trim(p->>'region'),consent_version=CASE WHEN (p->>'enabled')::boolean THEN 'briefing-2026-11-10-v1' ELSE NULL END,
  enabled_at=CASE WHEN (p->>'enabled')::boolean AND NOT pref.enabled THEN now() ELSE enabled_at END,version=version+1,last_state='PENDING' WHERE profile_id=who RETURNING * INTO pref;
  DELETE FROM app_private.briefing_jobs WHERE profile_id=who;
  -- Withdrawal removes private analyses; usage reservations remain for the daily spending cap.
  IF NOT pref.enabled THEN DELETE FROM app_private.briefing_posts WHERE profile_id=who; END IF;
 ELSIF op='briefing.feedback' THEN
  SELECT * INTO post FROM app_private.briefing_posts WHERE id=(p->>'postId')::uuid AND profile_id=who;
  IF NOT FOUND OR NOT pref.enabled OR EXISTS(SELECT 1 FROM unnest(post.owners) owner WHERE NOT app_private.briefing_can_use(who,owner)) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p-ARRAY['postId','action','value']<>'{}' OR p->>'action' NOT IN ('saved','helpful','hidden') OR jsonb_typeof(p->'value') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.briefing_feedback(post_id) VALUES(post.id) ON CONFLICT DO NOTHING;
  UPDATE app_private.briefing_feedback SET saved=CASE WHEN p->>'action'='saved' THEN (p->>'value')::boolean ELSE saved END,
  helpful=CASE WHEN p->>'action'='helpful' THEN (p->>'value')::boolean ELSE helpful END,hidden=CASE WHEN p->>'action'='hidden' THEN (p->>'value')::boolean ELSE hidden END WHERE post_id=post.id;
  RETURN app_private.briefing_post_json(post);
 ELSIF op<>'briefing.read' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT * INTO cfg FROM app_private.briefing_system WHERE id;
 WITH matching AS (
 SELECT b.* FROM app_private.briefing_posts b LEFT JOIN app_private.briefing_feedback f ON f.post_id=b.id
 WHERE b.profile_id=who AND pref.enabled AND NOT coalesce(f.hidden,false) AND (NOT coalesce((p->>'saved')::boolean,false) OR f.saved)
 AND NOT EXISTS(SELECT 1 FROM unnest(b.owners) owner WHERE NOT app_private.briefing_can_use(who,owner))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.items) item WHERE (item->>'validUntil')::date>=today)
 AND (NOT (p?'cursor') OR (b.updated_at,b.id)<((p->'cursor'->>'updatedAt')::timestamptz,(p->'cursor'->>'id')::uuid))
 ORDER BY b.updated_at DESC,b.id DESC LIMIT 11
 ), numbered AS (SELECT b.*,row_number() OVER(ORDER BY b.updated_at DESC,b.id DESC) n FROM matching b)
 SELECT coalesce(jsonb_agg(app_private.briefing_post_json((SELECT b FROM app_private.briefing_posts b WHERE b.id=n.id)) ORDER BY n.updated_at DESC,n.id DESC) FILTER(WHERE n.n<=10),'[]'),count(*)>10 INTO results,has_more FROM numbered n;
 RETURN jsonb_build_object('updateReceipt',jsonb_build_object('profileId',who,'menu','briefing','revision',coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu='briefing'),0)),'preferences',jsonb_build_object('enabled',pref.enabled,'region',pref.region,'version',pref.version,'lastCheckedAt',pref.last_checked_at,'lastState',pref.last_state,'newContentCount',pref.new_content_count),
 'available',cfg.enabled AND EXISTS(SELECT 1 FROM app_private.ai_provider_settings WHERE id AND ciphertext IS NOT NULL),
 'posts',results,'hasMore',has_more,'nextCursor',CASE WHEN has_more THEN jsonb_build_object('updatedAt',results->9->>'updatedAt','id',results->9->>'id') ELSE NULL END,'serverDay',today);
END $$;
CREATE FUNCTION app_private.briefing_worker(op text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE d date:=((now() AT TIME ZONE 'Asia/Seoul')-interval '3 hours')::date;
 j app_private.briefing_jobs%ROWTYPE;cfg app_private.briefing_system%ROWTYPE;pref app_private.briefing_preferences%ROWTYPE;
 ctx jsonb;credential app_private.ai_provider_settings%ROWTYPE;result jsonb;it jsonb;post app_private.briefing_posts%ROWTYPE;arr jsonb;kind_name text;target uuid;changed boolean:=false;used integer;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(83002);
 SELECT * INTO cfg FROM app_private.briefing_system WHERE id;
 IF op='enqueue' THEN
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('enqueued',0); END IF;
  INSERT INTO app_private.briefing_jobs(profile_id,day,preference_version)
  SELECT b.profile_id,d,b.version FROM app_private.briefing_preferences b WHERE b.enabled AND b.consent_version='briefing-2026-11-10-v1'
  AND b.enabled_at<=(d+time '03:00') AT TIME ZONE 'Asia/Seoul' AND app_private.briefing_active(b.profile_id)
  AND NOT EXISTS(SELECT 1 FROM app_private.briefing_jobs q WHERE q.profile_id=b.profile_id AND q.day=d) ORDER BY b.profile_id LIMIT 100 ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS used=ROW_COUNT;
  DELETE FROM app_private.briefing_jobs WHERE created_at<now()-interval '2 days' AND state NOT IN ('QUEUED','LEASED');
  DELETE FROM app_private.briefing_posts WHERE updated_at<now()-interval '90 days';
  DELETE FROM app_private.briefing_usage WHERE created_at<now()-interval '90 days';
  RETURN jsonb_build_object('enqueued',used);
 ELSIF op='claim' THEN
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('state','DISABLED'); END IF;
  SELECT * INTO j FROM app_private.briefing_jobs WHERE day=d AND ((state='QUEUED' AND retry_at<=now()) OR (state='LEASED' AND lease_until<now())) ORDER BY retry_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','IDLE'); END IF;
  SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=j.profile_id;
  IF NOT pref.enabled OR pref.version<>j.preference_version OR NOT app_private.briefing_active(j.profile_id) THEN UPDATE app_private.briefing_jobs SET state='CANCELLED' WHERE id=j.id;RETURN jsonb_build_object('state','CANCELLED');END IF;
  ctx:=app_private.briefing_context(j.profile_id,j.day);
  IF j.phase='ANALYZE' AND ctx->>'scope' IS DISTINCT FROM j.scope_hash THEN UPDATE app_private.briefing_jobs SET state='CANCELLED',error_code='CONTEXT_CHANGED' WHERE id=j.id;RETURN jsonb_build_object('state','CONTEXT_CHANGED');END IF;
  SELECT * INTO credential FROM app_private.ai_provider_settings WHERE id FOR SHARE;
  IF credential.ciphertext IS NULL THEN
   UPDATE app_private.briefing_preferences SET last_state='MISSING_KEY' WHERE profile_id=j.profile_id;
   RETURN jsonb_build_object('state','MISSING_KEY');
  END IF;
  IF j.attempts>=2 THEN UPDATE app_private.briefing_jobs SET state='ERROR',error_code='RETRY_LIMIT' WHERE id=j.id;RETURN jsonb_build_object('state','ERROR');END IF;
  IF (SELECT count(*) FROM app_private.briefing_usage WHERE day=(now() AT TIME ZONE 'Asia/Seoul')::date)>=cfg.daily_call_limit THEN
   UPDATE app_private.briefing_preferences SET last_state='LIMIT' WHERE profile_id=j.profile_id;RETURN jsonb_build_object('state','LIMIT');END IF;
  UPDATE app_private.briefing_jobs SET state='LEASED',token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,
  context=CASE WHEN phase='SEARCH' THEN ctx ELSE context END,scope_hash=ctx->>'scope',system_version=cfg.version,credential_version=credential.version WHERE id=j.id RETURNING * INTO j;
  INSERT INTO app_private.briefing_usage(token,job_id,day,phase,model) VALUES(j.token,j.id,(now() AT TIME ZONE 'Asia/Seoul')::date,j.phase,cfg.model);
  RETURN jsonb_build_object('state','LEASED','id',j.id,'token',j.token,'phase',j.phase,'day',j.day,'context',j.context,'research',j.research,'model',cfg.model,'ciphertext',credential.ciphertext);
 END IF;
 SELECT * INTO j FROM app_private.briefing_jobs WHERE id=(p->>'id')::uuid AND token=(p->>'token')::uuid AND state='LEASED' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','STALE_LEASE'); END IF;
 SELECT * INTO pref FROM app_private.briefing_preferences WHERE profile_id=j.profile_id;
 SELECT * INTO credential FROM app_private.ai_provider_settings WHERE id FOR SHARE;
 IF NOT cfg.enabled OR cfg.version<>j.system_version OR NOT pref.enabled OR pref.version<>j.preference_version OR credential.version<>j.credential_version OR NOT app_private.briefing_active(j.profile_id) OR app_private.briefing_context(j.profile_id,j.day)->>'scope' IS DISTINCT FROM j.scope_hash THEN
  UPDATE app_private.briefing_jobs SET state='CANCELLED',context=NULL,research=NULL,error_code='CONTEXT_CHANGED' WHERE id=j.id;RETURN jsonb_build_object('state','CANCELLED');END IF;
 IF op='fail' THEN
  IF p->>'code'='NO_CONTEXT' THEN DELETE FROM app_private.briefing_usage WHERE token=j.token; END IF;
  IF p->>'code' NOT IN ('AI_AUTH','AI_LIMIT','AI_UNAVAILABLE','NO_EVIDENCE','INVALID_RESULT','ENCRYPTION','NO_CONTEXT') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  UPDATE app_private.briefing_jobs SET state=CASE WHEN attempts>=2 OR p->>'code' IN ('AI_AUTH','NO_CONTEXT','NO_EVIDENCE','INVALID_RESULT','ENCRYPTION') THEN 'ERROR' ELSE 'QUEUED' END,retry_at=now()+interval '5 minutes',error_code=p->>'code' WHERE id=j.id;
  UPDATE app_private.briefing_preferences SET last_checked_at=now(),last_state=CASE WHEN p->>'code'='NO_CONTEXT' THEN 'NO_CONTEXT' ELSE 'ERROR' END WHERE profile_id=j.profile_id;
  RETURN jsonb_build_object('state','FAILED');
 END IF;
 UPDATE app_private.briefing_usage SET input_tokens=least(greatest(coalesce((p->>'inputTokens')::int,0),0),1000000),output_tokens=least(greatest(coalesce((p->>'outputTokens')::int,0),0),1000000) WHERE token=j.token;
 IF op='advance' AND j.phase='SEARCH' THEN
  IF jsonb_typeof(p->'research') IS DISTINCT FROM 'object' OR octet_length((p->'research')::text)>100000 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  UPDATE app_private.briefing_jobs SET phase='ANALYZE',state='QUEUED',research=p->'research',attempts=0,retry_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('state','QUEUED');
 ELSIF op='complete' THEN
  IF jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'items')>6 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
   IF it->>'category' NOT IN ('FACILITY','NOTICE','EVENT','SAFETY') OR length(it->>'fingerprint')<>64 OR length(it->>'contentHash')<>64 OR (it->>'score')::int NOT BETWEEN 80 AND 100 OR (it->>'validUntil')::date<d OR length(it->>'summary')>500 OR length(it->>'title')>100 OR it->>'sourceUrl' !~ '^https://' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   -- A matching event from another URL updates its original post rather than creating a new one.
   SELECT b.* INTO post FROM app_private.briefing_posts b WHERE b.profile_id=j.profile_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.items) x WHERE (x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category')) ORDER BY b.created_at LIMIT 1 FOR UPDATE;
   IF FOUND THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(post.items) x WHERE (x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category') AND x->>'contentHash' IS DISTINCT FROM it->>'contentHash') THEN
     SELECT jsonb_agg(CASE WHEN x->>'fingerprint'=it->>'fingerprint' OR x->>'sourceUrl'=it->>'sourceUrl' AND x->>'matchKey'=it->>'matchKey' AND x->>'category'=it->>'category' THEN it ELSE x END) INTO arr FROM jsonb_array_elements(post.items) x;
     UPDATE app_private.briefing_posts SET items=arr,owners=ARRAY(SELECT jsonb_array_elements_text(j.context->'owners')::uuid),updated_at=now() WHERE id=post.id;changed:=true;
    END IF;CONTINUE;
   END IF;
   kind_name:=CASE WHEN (it->>'urgent')::boolean AND it->>'category'='SAFETY' AND (it->>'score')::int>=95 THEN 'URGENT' ELSE 'REGULAR' END;
   SELECT * INTO post FROM app_private.briefing_posts WHERE profile_id=j.profile_id AND day=j.day AND kind=kind_name FOR UPDATE;
   IF FOUND THEN
    IF jsonb_array_length(post.items)>=3 THEN CONTINUE;END IF;
    UPDATE app_private.briefing_posts SET items=items||jsonb_build_array(it),updated_at=now() WHERE id=post.id;
   ELSE INSERT INTO app_private.briefing_posts(profile_id,day,kind,region,items,owners) VALUES(j.profile_id,j.day,kind_name,pref.region,jsonb_build_array(it),ARRAY(SELECT jsonb_array_elements_text(j.context->'owners')::uuid));
   END IF;changed:=true;
  END LOOP;
  UPDATE app_private.briefing_jobs SET state='DONE',context=NULL,research=NULL WHERE id=j.id;
  UPDATE app_private.briefing_preferences SET last_checked_at=now(),last_scan_at=j.created_at,last_state=CASE WHEN changed THEN 'DONE' ELSE 'EMPTY' END,
  new_content_count=(SELECT count(*) FROM jsonb_array_elements(j.context->'items') x WHERE (x->>'changed')::boolean) WHERE profile_id=j.profile_id;
  IF changed THEN INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(j.profile_id,'briefing') ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1; END IF;
  RETURN jsonb_build_object('state','DONE','changed',changed);
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v138;
REVOKE ALL ON FUNCTION app_private.workspace_command_v138(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; rev bigint;
BEGIN
 IF op='workspace.updates.read' AND p->>'menu'='briefing' THEN
  identity:=app_private.workspace_command_v138('workspace.me','{}');who:=(identity->>'id')::uuid;
  IF who IS NULL OR NOT app_private.briefing_active(who) OR p->>'profileId' IS DISTINCT FROM who::text THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
  IF jsonb_typeof(p->'revision') IS DISTINCT FROM 'number' OR (p->>'revision')::numeric<0 OR trunc((p->>'revision')::numeric)<>(p->>'revision')::numeric THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  rev:=(p->>'revision')::bigint;
  IF rev>coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu='briefing'),0) THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  UPDATE app_private.workspace_menu_updates SET seen_revision=greatest(seen_revision,rev) WHERE profile_id=who AND menu='briefing';
  RETURN app_private.workspace_menu_snapshot(who);
 END IF;
 RETURN app_private.workspace_command_v138(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
REVOKE ALL ON FUNCTION app_private.briefing_active(uuid),app_private.briefing_can_use(uuid,uuid),app_private.briefing_context(uuid,date),app_private.briefing_post_json(app_private.briefing_posts),app_private.briefing_command(text,jsonb),app_private.briefing_worker(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.briefing_command(text,jsonb) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_private.briefing_worker(text,jsonb) TO worker_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
