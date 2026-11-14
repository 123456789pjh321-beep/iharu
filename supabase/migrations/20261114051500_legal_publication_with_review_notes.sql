GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;

ALTER FUNCTION app_private.legal_command(text,jsonb) RENAME TO legal_command_before_publication_update;
REVOKE ALL ON FUNCTION app_private.legal_command_before_publication_update(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;

CREATE FUNCTION app_private.legal_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 config app_private.legal_settings%ROWTYPE;
 reason text:=btrim(coalesce(p->>'reason',''));
 field text;
 gaps text[]:='{}';
 published_version integer;
 audit_details jsonb;
BEGIN
 IF op NOT IN ('legal.admin.publish','legal.admin.service.publish') THEN
  RETURN app_private.legal_command_before_publication_update(op,p);
 END IF;
 IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF p->'reviewed' IS DISTINCT FROM 'true'::jsonb OR length(reason) NOT BETWEEN 3 AND 300 THEN
  RAISE EXCEPTION 'INVALID_INPUT';
 END IF;
 SELECT * INTO STRICT config FROM app_private.legal_settings WHERE singleton FOR UPDATE;

 IF op='legal.admin.publish' THEN
  IF (p->>'version')::integer IS DISTINCT FROM config.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  FOREACH field IN ARRAY ARRAY['operatorName','privacyOfficer','contactEmail','terms','privacy','children','processors','transfers','retention'] LOOP
   IF length(btrim(coalesce(config.draft->>field,'')))<3
      OR (field='contactEmail' AND config.draft->>field !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   THEN gaps:=array_append(gaps,field); END IF;
  END LOOP;
  IF cardinality(gaps)>0 THEN RAISE EXCEPTION 'POLICY_INCOMPLETE' USING DETAIL=to_jsonb(gaps)::text; END IF;
  INSERT INTO app_private.legal_publications(version,document,published_by)
   VALUES((SELECT coalesce(max(version),0)+1 FROM app_private.legal_publications),
          config.draft-'reviewNotes',app_private.actor())
   RETURNING version INTO published_version;
  UPDATE app_private.legal_settings SET version=version+1,updated_at=now() WHERE singleton;
  audit_details:=jsonb_build_object('publicationVersion',published_version);
 ELSE
  IF (p->>'version')::integer IS DISTINCT FROM config.service_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF length(btrim(coalesce(config.service_draft->>'title','')))<3
     OR length(btrim(coalesce(config.service_draft->>'body','')))<20
  THEN RAISE EXCEPTION 'SERVICE_INCOMPLETE'; END IF;
  published_version:=coalesce((config.service_publication->>'version')::integer,0)+1;
  UPDATE app_private.legal_settings
   SET service_publication=jsonb_build_object('version',published_version,'document',service_draft,'publishedAt',now()),
       service_version=service_version+1,service_updated_at=now()
   WHERE singleton;
  audit_details:=jsonb_build_object('serviceDraftVersion',config.service_version+1);
 END IF;

 INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details)
 VALUES('ADMIN',op,app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,reason,audit_details);
 RETURN jsonb_build_object('status','PUBLISHED','config',app_private.legal_command_before_publication_update('legal.admin.read','{}'));
END $$;

REVOKE ALL ON FUNCTION app_private.legal_command(text,jsonb) FROM PUBLIC,app_runtime,worker_runtime;
GRANT EXECUTE ON FUNCTION app_private.legal_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
