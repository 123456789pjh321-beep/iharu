-- UI83. System administration is separate from family ownership.
SELECT set_config('iharu.migration_executor',current_user,true);
CREATE TABLE app_private.system_admins (
 member_id uuid PRIMARY KEY REFERENCES iharu_auth.members(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 granted_by uuid REFERENCES iharu_auth.members(id), granted_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.system_member_controls (
 target_id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('PARENT','CHILD')),
 suspended boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.system_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL CHECK(category IN ('ADMIN','MEMBER','FAMILY','SCHEDULE','AUTH')),
 action text NOT NULL, actor_id uuid, target_id uuid, request_id uuid,
 reason text NOT NULL DEFAULT '', details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.system_request_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, operation text NOT NULL,
 method text NOT NULL, status integer NOT NULL CHECK(status BETWEEN 100 AND 599), duration_ms integer NOT NULL CHECK(duration_ms>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX system_events_recent ON app_private.system_events(created_at DESC,id);
CREATE INDEX system_events_target ON app_private.system_events(target_id,created_at DESC);
CREATE INDEX system_events_category ON app_private.system_events(category,created_at DESC);
CREATE INDEX system_logs_recent ON app_private.system_request_logs(created_at DESC,id);
CREATE INDEX system_logs_request ON app_private.system_request_logs(request_id);
CREATE INDEX system_logs_errors ON app_private.system_request_logs(status,created_at DESC) WHERE status>=400;
CREATE INDEX system_auth_sessions_user ON iharu_auth.session("userId","expiresAt");
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['system_admins','system_member_controls','system_events','system_request_logs'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY system_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT UPDATE ON app_private.system_admins,app_private.system_member_controls TO iharu_policy;
GRANT UPDATE(status,session_epoch) ON iharu_auth.members TO iharu_policy;
GRANT UPDATE(name) ON iharu_auth."user" TO iharu_policy;
GRANT UPDATE("expiresAt") ON iharu_auth.session TO iharu_policy;

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
-- Grant only the already-existing, verified account requested by the owner.
INSERT INTO app_private.system_admins(member_id)
 SELECT m.id FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
 WHERE lower(u.email)='987654321pjh123@gmail.com' AND u."emailVerified" AND m.status='ACTIVE';
INSERT INTO app_private.system_events(category,action,target_id,reason)
 SELECT 'ADMIN','admin.role.bootstrap',member_id,'서비스 소유자 요청에 따른 최초 최고관리자 지정' FROM app_private.system_admins;

CREATE FUNCTION app_private.system_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT app_private.account_verified() AND EXISTS(SELECT 1 FROM app_private.system_admins WHERE member_id=app_private.actor() AND active)
$$;
CREATE VIEW app_private.system_member_directory WITH(security_invoker=true) AS
 WITH accounts AS (
  SELECT m.id,m.id AS member_id,NULL::uuid AS child_account_id,u.name,u.email,NULL::text AS login_id,'PARENT'::text AS kind,
   m.status,u."emailVerified" AS verified,m.created_at,m.auth_user_id
  FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id
  UNION ALL
  SELECT a.id,NULL::uuid,a.id,a.name,NULL::text,a.login_id,'CHILD',CASE WHEN coalesce(c.suspended,false) THEN 'SUSPENDED' ELSE 'ACTIVE' END,true,a.created_at,NULL::text
  FROM app_private.child_accounts a LEFT JOIN app_private.system_member_controls c ON c.target_id=a.id
 ), directory AS (
  SELECT a.*,p.id AS profile_id,l.family_id,f.name AS family_name,p.id=f.host_id AS is_host,
   coalesce(sa.active,false) AS super_admin,coalesce(sa.version,0) AS role_version,coalesce(mc.version,0) AS version
  FROM accounts a LEFT JOIN app_private.workspace_profiles p ON p.member_id=a.member_id OR p.child_account_id=a.child_account_id
  LEFT JOIN app_private.workspace_links l ON l.profile_id=p.id AND l.active
  LEFT JOIN app_private.workspace_families f ON f.id=l.family_id
  LEFT JOIN app_private.system_admins sa ON sa.member_id=a.member_id
  LEFT JOIN app_private.system_member_controls mc ON mc.target_id=a.id
 ) SELECT * FROM directory;

CREATE FUNCTION app_private.system_member_json(mid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',d.id,'profileId',d.profile_id,'name',d.name,'email',d.email,'loginId',d.login_id,'kind',d.kind,
 'status',d.status,'verified',d.verified,'createdAt',d.created_at,'familyId',d.family_id,'familyName',d.family_name,'host',coalesce(d.is_host,false),
 'superAdmin',d.super_admin,'roleVersion',d.role_version,'version',d.version,
 'lastSeenAt',CASE WHEN d.kind='PARENT' THEN (SELECT max(g.last_seen_at) FROM iharu_auth.session s JOIN iharu_auth.session_guard g ON g.session_id=s.id WHERE s."userId"=d.auth_user_id)
 ELSE (SELECT max(s.last_seen_at) FROM app_private.workspace_sessions s WHERE s.profile_id=d.profile_id) END,
 'activeSessions',CASE WHEN d.kind='PARENT' THEN (SELECT count(*) FROM iharu_auth.session s WHERE s."userId"=d.auth_user_id AND s."expiresAt">now())
 ELSE (SELECT count(*) FROM app_private.workspace_sessions s WHERE s.profile_id=d.profile_id AND s.revoked_at IS NULL AND s.expires_at>now()) END)
 FROM app_private.system_member_directory d WHERE d.id=mid
$$;

CREATE FUNCTION app_private.system_log_request(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF length(p->>'operation')>100 OR (p->>'operation') !~ '^/api/[a-zA-Z0-9_./-]+$' OR (p->>'method') NOT IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 INSERT INTO app_private.system_request_logs(request_id,operation,method,status,duration_ms)
 VALUES(nullif(current_setting('iharu.request_id',true),'')::uuid,p->>'operation',p->>'method',(p->>'status')::integer,least(3600000,greatest(0,(p->>'durationMs')::integer)));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION app_private.admin_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_actor uuid:=app_private.actor(); d app_private.system_member_directory%ROWTYPE; result jsonb; before_value jsonb;
 v_page integer:=coalesce((p->>'page')::integer,1); v_size integer:=coalesce((p->>'pageSize')::integer,12);
 v_query text:=lower(coalesce(p->>'query','')); v_reason text:=btrim(coalesce(p->>'reason','')); v_target uuid;
 v_from timestamptz:=coalesce((p->>'from')::timestamptz,now()-interval '30 days'); v_to timestamptz:=coalesce((p->>'to')::timestamptz,now()+interval '1 day');
BEGIN
 IF op='admin.access' THEN RETURN jsonb_build_object('allowed',app_private.system_is_admin()); END IF;
 IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF v_page NOT BETWEEN 1 AND 10000 OR v_size NOT BETWEEN 1 AND 100 OR length(v_query)>100 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF op='admin.overview' THEN
  RETURN jsonb_build_object('members',(SELECT count(*) FROM app_private.system_member_directory),'parents',(SELECT count(*) FROM iharu_auth.members),
  'children',(SELECT count(*) FROM app_private.child_accounts),'families',(SELECT count(*) FROM app_private.workspace_families f WHERE EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.family_id=f.id AND l.active)),
  'suspended',(SELECT count(*) FROM app_private.system_member_directory WHERE status='SUSPENDED'),'admins',(SELECT count(*) FROM app_private.system_admins WHERE active),
  'newMembers',(SELECT count(*) FROM app_private.system_member_directory WHERE created_at>now()-interval '7 days'),
  'errors24h',(SELECT count(*) FROM app_private.system_request_logs WHERE status>=500 AND created_at>now()-interval '24 hours'),
  'events24h',(SELECT count(*) FROM app_private.system_events WHERE created_at>now()-interval '24 hours'),
  'collectionStartedAt',(SELECT min(created_at) FROM app_private.system_events),'serverNow',now());
 ELSIF op='admin.members' THEN
  WITH matching AS (SELECT * FROM app_private.system_member_directory x WHERE
   (v_query='' OR lower(concat_ws(' ',x.name,x.email,x.login_id,x.family_name)) LIKE '%'||v_query||'%') AND
   (coalesce(p->>'kind','ALL')='ALL' OR x.kind=p->>'kind') AND (coalesce(p->>'status','ALL')='ALL' OR x.status=p->>'status')),
  groups AS (SELECT coalesce(family_id,id) AS group_id,max(family_id::text)::uuid AS fid,min(created_at) AS created FROM matching GROUP BY coalesce(family_id,id)),
  selected AS (SELECT * FROM groups ORDER BY created,group_id LIMIT v_size OFFSET (v_page-1)*v_size)
  SELECT jsonb_build_object('page',v_page,'pageSize',v_size,'totalGroups',(SELECT count(*) FROM groups),'matchedMembers',(SELECT count(*) FROM matching),
   'groups',coalesce(jsonb_agg(jsonb_build_object('id',s.group_id,'familyId',s.fid,'name',coalesce(f.name,'가족 미연결'),
   'members',(SELECT jsonb_agg(app_private.system_member_json(x.id) ORDER BY coalesce(x.is_host,false) DESC,x.kind DESC,x.created_at) FROM app_private.system_member_directory x WHERE (s.fid IS NOT NULL AND x.family_id=s.fid) OR (s.fid IS NULL AND x.id=s.group_id))) ORDER BY s.created,s.group_id),'[]'::jsonb)) INTO result
   FROM selected s LEFT JOIN app_private.workspace_families f ON f.id=s.fid;
  RETURN result;
 ELSIF op='admin.member' THEN
  result:=app_private.system_member_json((p->>'id')::uuid);IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;RETURN result;
 ELSIF op='admin.roles' THEN
  RETURN jsonb_build_object('admins',coalesce((SELECT jsonb_agg(app_private.system_member_json(member_id) ORDER BY granted_at) FROM app_private.system_admins WHERE active),'[]'::jsonb));
 ELSIF op='admin.history' THEN
  WITH history AS (
   SELECT e.id,e.category,e.action,e.actor_id,e.target_id,e.request_id,e.reason,e.details,e.created_at FROM app_private.system_events e
   UNION ALL SELECT e.id,'LEGACY',e.action,e.actor_id,e.target_id,e.request_id,'','{}'::jsonb,e.created_at FROM app_private.audit_events e
  ), filtered AS (SELECT e.*,coalesce(u.name,pp.name,'시스템') AS actor_name FROM history e
   LEFT JOIN iharu_auth.members m ON m.id=e.actor_id LEFT JOIN iharu_auth."user" u ON u.id=m.auth_user_id
   LEFT JOIN app_private.workspace_profiles pp ON pp.id=e.actor_id
   WHERE e.created_at>=v_from AND e.created_at<v_to AND (coalesce(p->>'category','ALL')='ALL' OR e.category=p->>'category')
   AND (p->>'targetId' IS NULL OR e.target_id=(p->>'targetId')::uuid)
   AND (v_query='' OR lower(concat_ws(' ',e.action,e.reason,u.name,pp.name,e.request_id::text)) LIKE '%'||v_query||'%')),
  selected AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT v_size OFFSET (v_page-1)*v_size)
  SELECT jsonb_build_object('page',v_page,'pageSize',v_size,'total',(SELECT count(*) FROM filtered),'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'action',action,'actorName',actor_name,'targetId',target_id,'requestId',request_id,'reason',reason,'details',details,'createdAt',created_at) ORDER BY created_at DESC,id DESC),'[]'::jsonb)) INTO result FROM selected;RETURN result;
 ELSIF op='admin.logs' THEN
  WITH filtered AS (SELECT * FROM app_private.system_request_logs WHERE created_at>=v_from AND created_at<v_to
   AND (coalesce(p->>'level','ALL')='ALL' OR (p->>'level'='ERROR' AND status>=500) OR (p->>'level'='WARN' AND status BETWEEN 400 AND 499) OR (p->>'level'='INFO' AND status<400))
   AND (v_query='' OR lower(operation||' '||request_id::text) LIKE '%'||v_query||'%')),
  selected AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT v_size OFFSET (v_page-1)*v_size)
  SELECT jsonb_build_object('page',v_page,'pageSize',v_size,'total',(SELECT count(*) FROM filtered),'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'requestId',request_id,'operation',operation,'method',method,'status',status,'durationMs',duration_ms,'createdAt',created_at) ORDER BY created_at DESC,id DESC),'[]'::jsonb)) INTO result FROM selected;RETURN result;
 ELSIF op IN ('admin.member.update','admin.member.sessions.revoke','admin.role.set') THEN
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(83001);
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  v_target:=(p->>'id')::uuid;SELECT * INTO d FROM app_private.system_member_directory WHERE id=v_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  before_value:=jsonb_build_object('name',d.name,'status',d.status,'superAdmin',d.super_admin);
  IF op='admin.role.set' THEN
   IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
   IF d.kind<>'PARENT' OR NOT d.verified OR d.status<>'ACTIVE' THEN RAISE EXCEPTION 'ROLE_TARGET_INVALID'; END IF;
   IF d.role_version<>(p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF (p->>'active')::boolean IS FALSE AND d.super_admin AND (SELECT count(*) FROM app_private.system_admins WHERE active)<=1 THEN RAISE EXCEPTION 'LAST_ADMIN'; END IF;
   IF v_target=v_actor AND (p->>'active')::boolean IS FALSE THEN RAISE EXCEPTION 'SELF_PROTECTED'; END IF;
   INSERT INTO app_private.system_admins(member_id,active,granted_by) VALUES(v_target,(p->>'active')::boolean,v_actor)
   ON CONFLICT(member_id) DO UPDATE SET active=excluded.active,version=app_private.system_admins.version+1,granted_by=v_actor,updated_at=now();
  ELSE
   IF d.version<>(p->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF v_target=v_actor AND (op='admin.member.sessions.revoke' OR p->>'status'='SUSPENDED') THEN RAISE EXCEPTION 'SELF_PROTECTED'; END IF;
   IF d.super_admin AND p->>'status'='SUSPENDED' THEN RAISE EXCEPTION 'ADMIN_ACCOUNT_PROTECTED'; END IF;
   IF d.status='DELETION_PENDING' THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE'; END IF;
   IF op='admin.member.update' THEN
    IF p ? 'name' THEN
     IF length(btrim(p->>'name')) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
     IF d.kind='PARENT' THEN UPDATE iharu_auth."user" SET name=btrim(p->>'name') WHERE id=d.auth_user_id;
     ELSE UPDATE app_private.child_accounts SET name=btrim(p->>'name') WHERE id=d.child_account_id;END IF;
     UPDATE app_private.workspace_profiles SET name=btrim(p->>'name') WHERE id=d.profile_id;
    END IF;
    IF p ? 'status' AND p->>'status' NOT IN ('ACTIVE','SUSPENDED') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    IF d.kind='PARENT' AND p ? 'status' THEN UPDATE iharu_auth.members SET status=p->>'status',session_epoch=session_epoch+1 WHERE id=d.member_id;END IF;
   END IF;
   INSERT INTO app_private.system_member_controls(target_id,kind,suspended) VALUES(v_target,d.kind,coalesce(p->>'status',d.status)='SUSPENDED')
   ON CONFLICT(target_id) DO UPDATE SET suspended=excluded.suspended,version=app_private.system_member_controls.version+1,updated_at=now();
   IF op='admin.member.sessions.revoke' OR p->>'status'='SUSPENDED' THEN
    UPDATE iharu_auth.session SET "expiresAt"=now() WHERE "userId"=d.auth_user_id AND "expiresAt">now();
    UPDATE app_private.workspace_sessions SET revoked_at=now() WHERE profile_id=d.profile_id AND revoked_at IS NULL;
    UPDATE app.child_devices SET status='REVOKED' WHERE child_id=(SELECT child_id FROM app_private.child_accounts WHERE id=d.child_account_id) AND status='ACTIVE';
   END IF;
  END IF;
  result:=app_private.system_member_json(v_target);
  INSERT INTO app_private.system_events(category,action,actor_id,target_id,request_id,reason,details)
   VALUES('ADMIN',op,v_actor,v_target,nullif(current_setting('iharu.request_id',true),'')::uuid,v_reason,
    jsonb_build_object('before',before_value,'after',jsonb_build_object('name',result->>'name','status',result->>'status','superAdmin',result->'superAdmin')));
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;

-- Suspension is enforced inside the same database boundary as normal workspace access.
CREATE OR REPLACE FUNCTION app_private.workspace_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.id FROM app_private.workspace_profiles p WHERE
 (p.member_id=app_private.actor() AND app_private.account_verified()) OR
 (p.kind='CHILD' AND NOT EXISTS(SELECT 1 FROM app_private.system_member_controls c WHERE c.target_id=p.child_account_id AND c.suspended)
 AND EXISTS(SELECT 1 FROM app_private.workspace_sessions s WHERE s.profile_id=p.id AND s.token_hash=nullif(current_setting('iharu.workspace_hash',true),'') AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '7 days')) LIMIT 1
$$;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v82;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF op IN ('workspace.credentials','workspace.child.login') AND EXISTS(SELECT 1 FROM app_private.child_accounts a JOIN app_private.system_member_controls c ON c.target_id=a.id AND c.suspended WHERE a.login_id=p->>'loginId') THEN
  IF op='workspace.credentials' THEN RETURN '{}'::jsonb; END IF;RAISE EXCEPTION 'LOGIN_INVALID';
 END IF;
 RETURN app_private.workspace_command_v82(op,p);
END $$;
ALTER FUNCTION app_private.child_account_command(text,jsonb) RENAME TO child_account_command_v82;
CREATE FUNCTION app_private.child_account_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF op IN ('childaccount.credentials','childaccount.login','childaccount.renew','childaccount.status','childaccount.finish') AND EXISTS(SELECT 1 FROM app_private.child_accounts a JOIN app_private.system_member_controls c ON c.target_id=a.id AND c.suspended WHERE a.login_id=p->>'loginId' OR a.proof_hash=p->>'proofHash') THEN
  IF op='childaccount.credentials' THEN RETURN '{}'::jsonb; END IF;RAISE EXCEPTION 'CHILD_ACCESS_REVOKED';
 END IF;
 RETURN app_private.child_account_command_v82(op,p);
END $$;
CREATE FUNCTION app_private.system_device_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM app_private.child_accounts a JOIN app_private.system_member_controls c ON c.target_id=a.id AND c.suspended WHERE a.child_id=NEW.child_id) THEN RAISE EXCEPTION 'CHILD_ACCESS_REVOKED';END IF;RETURN NEW;
END $$;
CREATE FUNCTION app_private.system_admin_account_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.system_admins WHERE member_id=OLD.id AND active) AND (TG_OP='DELETE' OR NEW.status<>'ACTIVE') THEN RAISE EXCEPTION 'ADMIN_ACCOUNT_PROTECTED';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION app_private.system_capture_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target uuid; actor uuid:=app_private.actor(); action_name text; category_name text; detail jsonb:='{}';
BEGIN
 IF TG_TABLE_NAME='workspace_items' THEN
  IF TG_OP='UPDATE' AND NEW.data=OLD.data AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW;END IF;
  target:=NEW.id;category_name:='SCHEDULE';action_name:='workspace.'||lower(NEW.kind)||CASE WHEN TG_OP='INSERT' THEN '.created' WHEN NEW.deleted_at IS NOT NULL THEN '.deleted' ELSE '.updated' END;
  detail:=jsonb_build_object('kind',NEW.kind,'ownerId',NEW.owner_id);actor:=coalesce(actor,app_private.workspace_actor());
 ELSIF TG_TABLE_NAME='workspace_links' THEN
  IF TG_OP='UPDATE' AND NEW.active=OLD.active THEN RETURN NEW;END IF;
  target:=NEW.profile_id;category_name:='FAMILY';action_name:=CASE WHEN NEW.active THEN 'family.member.joined' ELSE 'family.member.left' END;detail:=jsonb_build_object('familyId',NEW.family_id);
 ELSIF TG_TABLE_NAME='workspace_profiles' THEN
  IF TG_OP='UPDATE' THEN RETURN NEW;END IF;target:=NEW.id;category_name:='MEMBER';action_name:='member.profile.created';detail:=jsonb_build_object('kind',NEW.kind);
 ELSIF TG_TABLE_NAME='session' THEN
  SELECT id INTO target FROM iharu_auth.members WHERE auth_user_id=CASE WHEN TG_OP='DELETE' THEN OLD."userId" ELSE NEW."userId" END;
  actor:=target;category_name:='AUTH';action_name:=CASE WHEN TG_OP='DELETE' THEN 'auth.session.ended' ELSE 'auth.session.created' END;
 ELSE RETURN NEW;
 END IF;
 INSERT INTO app_private.system_events(category,action,actor_id,target_id,request_id,details) VALUES(category_name,action_name,actor,target,nullif(current_setting('iharu.request_id',true),'')::uuid,detail);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Managed databases may revoke default PUBLIC function execution. Only the DDL
-- executor needs these three trigger functions during installation.
DO $$ BEGIN EXECUTE format('GRANT EXECUTE ON FUNCTION app_private.system_device_guard(),app_private.system_admin_account_guard(),app_private.system_capture_change() TO %I',current_setting('iharu.migration_executor')); END $$;
RESET ROLE;
CREATE TRIGGER system_block_suspended_device BEFORE INSERT OR UPDATE OF status ON app.child_devices FOR EACH ROW EXECUTE FUNCTION app_private.system_device_guard();
CREATE TRIGGER system_protect_admin_account BEFORE DELETE OR UPDATE OF status ON iharu_auth.members FOR EACH ROW EXECUTE FUNCTION app_private.system_admin_account_guard();
CREATE TRIGGER system_item_history AFTER INSERT OR UPDATE ON app_private.workspace_items FOR EACH ROW EXECUTE FUNCTION app_private.system_capture_change();
CREATE TRIGGER system_family_history AFTER INSERT OR UPDATE ON app_private.workspace_links FOR EACH ROW EXECUTE FUNCTION app_private.system_capture_change();
CREATE TRIGGER system_member_history AFTER INSERT ON app_private.workspace_profiles FOR EACH ROW EXECUTE FUNCTION app_private.system_capture_change();
CREATE TRIGGER system_auth_history AFTER INSERT OR DELETE ON iharu_auth.session FOR EACH ROW EXECUTE FUNCTION app_private.system_capture_change();
SET LOCAL ROLE iharu_policy;
REVOKE ALL ON app_private.system_member_directory FROM PUBLIC,app_runtime;
REVOKE ALL ON FUNCTION app_private.system_is_admin(),app_private.system_member_json(uuid),app_private.system_log_request(jsonb),app_private.admin_command(text,jsonb),app_private.system_device_guard(),app_private.system_admin_account_guard(),app_private.system_capture_change(),app_private.workspace_command(text,jsonb),app_private.child_account_command(text,jsonb),app_private.workspace_command_v82(text,jsonb),app_private.child_account_command_v82(text,jsonb) FROM PUBLIC,app_runtime;
DO $$ BEGIN EXECUTE format('REVOKE EXECUTE ON FUNCTION app_private.system_device_guard(),app_private.system_admin_account_guard(),app_private.system_capture_change() FROM %I',current_setting('iharu.migration_executor')); END $$;
GRANT EXECUTE ON FUNCTION app_private.admin_command(text,jsonb),app_private.system_log_request(jsonb),app_private.workspace_command(text,jsonb),app_private.child_account_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
