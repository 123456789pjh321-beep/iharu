-- UI84: versioned legal notices and authenticated privacy requests. No operator details are invented.
CREATE TABLE app_private.legal_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),version integer NOT NULL DEFAULT 0,draft jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO app_private.legal_settings(singleton) VALUES(true);
CREATE TABLE app_private.legal_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version integer NOT NULL UNIQUE,document jsonb NOT NULL,published_by uuid NOT NULL REFERENCES iharu_auth.members(id),published_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_private.legal_acceptances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES iharu_auth.members(id) ON DELETE CASCADE,publication_id uuid NOT NULL REFERENCES app_private.legal_publications(id),accepted_at timestamptz NOT NULL DEFAULT now(),withdrawn_at timestamptz,request_id uuid NOT NULL);
CREATE UNIQUE INDEX legal_current_acceptance ON app_private.legal_acceptances(member_id,publication_id) WHERE withdrawn_at IS NULL;
CREATE TABLE app_private.privacy_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id),kind text NOT NULL CHECK(kind IN ('ACCESS','CORRECTION','DELETE','STOP','WITHDRAW','GUARDIAN','COMPLAINT')),detail text NOT NULL CHECK(length(detail) BETWEEN 3 AND 2000),status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','REVIEWING','COMPLETED','REJECTED')),response text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX privacy_requests_owner ON app_private.privacy_requests(profile_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['legal_settings','legal_publications','legal_acceptances','privacy_requests'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY legal_policy ON app_private.%I TO iharu_policy USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,app_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT ON app_private.%I TO iharu_policy',t);
 END LOOP;
END $$;
GRANT UPDATE ON app_private.legal_settings,app_private.legal_acceptances,app_private.privacy_requests TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.legal_publication_json() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',id,'version',version,'document',document-'reviewNotes','publishedAt',published_at) FROM app_private.legal_publications ORDER BY version DESC LIMIT 1
$$;
CREATE FUNCTION app_private.legal_request_json(r app_private.privacy_requests) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',r.id,'kind',r.kind,'detail',r.detail,'status',r.status,'response',r.response,'version',r.version,'createdAt',r.created_at,'updatedAt',r.updated_at)
$$;
CREATE FUNCTION app_private.legal_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=app_private.actor(); profile uuid; config app_private.legal_settings%ROWTYPE; publication app_private.legal_publications%ROWTYPE; req app_private.privacy_requests%ROWTYPE; result jsonb; field text; why text:=btrim(coalesce(p->>'reason','')); v_kind text;
BEGIN
 IF op='legal.public' THEN RETURN jsonb_build_object('publication',app_private.legal_publication_json()); END IF;
 IF op LIKE 'legal.admin.%' THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO config FROM app_private.legal_settings WHERE singleton FOR UPDATE;
  IF op='legal.admin.read' THEN RETURN jsonb_build_object('draft',config.draft,'version',config.version,'publication',app_private.legal_publication_json(),'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'publishedAt',published_at) ORDER BY version DESC) FROM app_private.legal_publications),'[]'::jsonb)); END IF;
  IF op='legal.admin.requests' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(app_private.legal_request_json(r)||jsonb_build_object('requesterName',w.name) ORDER BY r.created_at DESC) FROM (SELECT * FROM app_private.privacy_requests ORDER BY created_at DESC LIMIT 200) r JOIN app_private.workspace_profiles w ON w.id=r.profile_id),'[]'::jsonb)); END IF;
  IF length(why) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF op IN ('legal.admin.save','legal.admin.publish') THEN
   IF (p->>'version')::integer IS DISTINCT FROM config.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF op='legal.admin.save' THEN
    IF jsonb_typeof(p->'draft') IS DISTINCT FROM 'object' OR length((p->'draft')::text)>110000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p->'draft') k WHERE k NOT IN ('operatorName','privacyOfficer','contactEmail','address','businessNumber','terms','privacy','children','processors','transfers','retention','reviewNotes')) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    UPDATE app_private.legal_settings SET draft=p->'draft',version=version+1,updated_at=now() WHERE singleton;
   ELSE
    IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
    IF p->>'reviewed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    FOREACH field IN ARRAY ARRAY['operatorName','privacyOfficer','contactEmail','terms','privacy','children','processors','transfers','retention'] LOOP
     IF length(btrim(coalesce(config.draft->>field,'')))<3 THEN RAISE EXCEPTION 'POLICY_INCOMPLETE'; END IF;
    END LOOP;
    IF config.draft->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'POLICY_INCOMPLETE'; END IF;
    INSERT INTO app_private.legal_publications(version,document,published_by) VALUES(coalesce((SELECT max(version)+1 FROM app_private.legal_publications),1),config.draft,actor) RETURNING * INTO publication;
    UPDATE app_private.legal_settings SET version=version+1,updated_at=now() WHERE singleton;
   END IF;
   result=jsonb_build_object('status','SAVED');
  ELSIF op='legal.admin.resolve' THEN
   SELECT * INTO req FROM app_private.privacy_requests WHERE id=(p->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF (p->>'version')::integer IS DISTINCT FROM req.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF p->>'status' NOT IN ('REVIEWING','COMPLETED','REJECTED') OR length(btrim(p->>'response')) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.privacy_requests SET status=p->>'status',response=p->>'response',version=version+1,updated_at=now() WHERE id=req.id RETURNING * INTO req;
   result=app_private.legal_request_json(req);
  ELSE RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.system_events(category,action,actor_id,target_id,request_id,reason,details) VALUES('ADMIN',op,actor,req.id,nullif(current_setting('iharu.request_id',true),'')::uuid,why,jsonb_build_object('publicationVersion',publication.version,'requestStatus',req.status));
  RETURN result;
 END IF;
 IF app_private.account_verified() THEN PERFORM app_private.workspace_command('workspace.me','{}'); END IF;
 profile=app_private.workspace_actor();IF profile IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT kind INTO v_kind FROM app_private.workspace_profiles WHERE id=profile;
 PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
 SELECT * INTO publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
 IF op='legal.state' THEN
  RETURN jsonb_build_object('publication',app_private.legal_publication_json(),'role',v_kind,'accepted',EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=actor AND publication_id=publication.id AND withdrawn_at IS NULL),'requests',coalesce((SELECT jsonb_agg(app_private.legal_request_json(r) ORDER BY r.created_at DESC) FROM app_private.privacy_requests r WHERE profile_id=profile),'[]'::jsonb),'consents',coalesce((SELECT jsonb_agg(jsonb_build_object('version',pub.version,'acceptedAt',a.accepted_at,'withdrawnAt',a.withdrawn_at) ORDER BY a.accepted_at DESC) FROM app_private.legal_acceptances a JOIN app_private.legal_publications pub ON pub.id=a.publication_id WHERE member_id=actor),'[]'::jsonb));
 ELSIF op='legal.accept' THEN
  IF v_kind<>'PARENT' OR NOT app_private.account_verified() THEN RAISE EXCEPTION 'PARENT_REQUIRED'; END IF;
  IF publication.id IS NULL OR publication.id IS DISTINCT FROM (p->>'publicationId')::uuid THEN RAISE EXCEPTION 'POLICY_CHANGED'; END IF;
  IF p->>'terms' IS DISTINCT FROM 'true' OR p->>'privacy' IS DISTINCT FROM 'true' OR p->>'adult' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.legal_acceptances(member_id,publication_id,request_id) VALUES(actor,publication.id,nullif(current_setting('iharu.request_id',true),'')::uuid) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('accepted',true);
 ELSIF op='legal.request.create' THEN
  IF p->>'kind' NOT IN ('ACCESS','CORRECTION','DELETE','STOP','WITHDRAW','GUARDIAN','COMPLAINT') OR length(btrim(p->>'detail')) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF (SELECT count(*) FROM app_private.privacy_requests WHERE profile_id=profile AND created_at>now()-interval '1 day')>=10 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
  INSERT INTO app_private.privacy_requests(profile_id,kind,detail) VALUES(profile,p->>'kind',p->>'detail') RETURNING * INTO req;
  IF req.kind='WITHDRAW' AND actor IS NOT NULL THEN UPDATE app_private.legal_acceptances SET withdrawn_at=now() WHERE member_id=actor AND withdrawn_at IS NULL; END IF;
  INSERT INTO app_private.system_events(category,action,actor_id,target_id,request_id,details) VALUES('MEMBER',op,actor,req.id,nullif(current_setting('iharu.request_id',true),'')::uuid,jsonb_build_object('kind',req.kind));
  RETURN app_private.legal_request_json(req);
 END IF;
 RAISE EXCEPTION 'INVALID_INPUT';
END $$;
-- The legal function is the only runtime entrypoint. Published snapshots cannot be updated.
REVOKE ALL ON FUNCTION app_private.legal_publication_json(),app_private.legal_request_json(app_private.privacy_requests),app_private.legal_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.legal_command(text,jsonb) TO app_runtime;
-- Require the current adult agreement before new workspace mutations once a reviewed policy is published.
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v83;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE pub uuid;
BEGIN
 IF op IN ('workspace.items.create','workspace.items.update','workspace.chat.send','workspace.invite.issue','workspace.family.join') AND app_private.account_verified() THEN
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO pub FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF pub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.legal_acceptances WHERE member_id=app_private.actor() AND publication_id=pub AND withdrawn_at IS NULL) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
 END IF;
 RETURN app_private.workspace_command_v83(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command_v83(text,jsonb),app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
