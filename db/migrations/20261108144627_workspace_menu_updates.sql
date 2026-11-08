-- Per-account menu revisions. No historic items are backfilled as new updates.
SELECT set_config('iharu.migration_executor',current_user,true);
CREATE TABLE app_private.workspace_menu_updates (
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 menu text NOT NULL CHECK(menu IN ('timetable','calendar','chat','fees','records','family')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 0 AND 9007199254740991),
 seen_revision bigint NOT NULL DEFAULT 0 CHECK(seen_revision>=0 AND seen_revision<=revision),
 PRIMARY KEY(profile_id,menu)
);
ALTER TABLE app_private.workspace_menu_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.workspace_menu_updates FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_menu_policy ON app_private.workspace_menu_updates TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.workspace_menu_updates FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE ON app_private.workspace_menu_updates TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_menu_snapshot(who uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('profileId',who,'updates',coalesce(jsonb_object_agg(u.menu,jsonb_build_object('revision',u.revision,'seen',u.seen_revision)),'{}'::jsonb))
 FROM app_private.workspace_menu_updates u JOIN app_private.workspace_profiles p ON p.id=u.profile_id
 WHERE u.profile_id=who AND (u.menu<>'fees' OR p.kind='PARENT')
$$;
CREATE FUNCTION app_private.workspace_menu_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target uuid; writer uuid:=app_private.workspace_actor(); menu_name text;
BEGIN
 IF TG_TABLE_NAME='workspace_items' THEN
  IF TG_OP='UPDATE' AND NEW.version=OLD.version AND NEW.data=OLD.data AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW; END IF;
  menu_name:=CASE NEW.kind WHEN 'REPEAT' THEN 'timetable' WHEN 'EVENT' THEN 'calendar' WHEN 'CHAT' THEN 'chat' WHEN 'FEE' THEN 'fees' WHEN 'NOTE' THEN 'records' END;
  FOR target IN SELECT p.id FROM app_private.workspace_profiles p
   WHERE p.id IS DISTINCT FROM writer AND app_private.workspace_can_read(p.id,NEW.owner_id)
   AND (NEW.kind<>'FEE' OR p.kind='PARENT') ORDER BY p.id LOOP
   INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(target,menu_name)
    ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1;
  END LOOP;
 ELSE
  IF TG_OP='UPDATE' AND NEW.active IS NOT DISTINCT FROM OLD.active THEN RETURN NEW; END IF;
  -- A family switch must not retain unread data from a former sharing group.
  UPDATE app_private.workspace_menu_updates SET seen_revision=revision WHERE profile_id=NEW.profile_id AND menu<>'family';
  FOR target IN SELECT DISTINCT p.id FROM app_private.workspace_profiles p
   WHERE p.id IS DISTINCT FROM writer AND (TG_OP<>'INSERT' OR p.id<>NEW.profile_id)
   AND (p.id=NEW.profile_id OR EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.profile_id=p.id AND l.family_id=NEW.family_id AND l.active)) ORDER BY p.id LOOP
   INSERT INTO app_private.workspace_menu_updates(profile_id,menu) VALUES(target,'family')
    ON CONFLICT(profile_id,menu) DO UPDATE SET revision=app_private.workspace_menu_updates.revision+1;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v84;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; menu_name text; viewed bigint:=0; receipt jsonb; result jsonb;
BEGIN
 IF op NOT IN ('workspace.updates.status','workspace.updates.read','workspace.items.list','workspace.chat.list','workspace.me') THEN RETURN app_private.workspace_command_v84(op,p); END IF;
 IF op='workspace.me' THEN
  who:=app_private.workspace_actor();
  SELECT revision INTO viewed FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu='family';
  result:=app_private.workspace_command_v84(op,p);
  RETURN result||jsonb_build_object('updateReceipt',jsonb_build_object('profileId',result->>'id','menu','family','revision',coalesce(viewed,0)));
 END IF;
 identity:=app_private.workspace_command_v84('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.updates.read' THEN
  IF p->>'profileId' IS DISTINCT FROM who::text THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  menu_name:=p->>'menu';
  IF menu_name NOT IN ('timetable','calendar','chat','fees','records','family') OR menu_name IS NULL OR jsonb_typeof(p->'revision') IS DISTINCT FROM 'number' OR (p->>'revision')::numeric<0 OR trunc((p->>'revision')::numeric)<>(p->>'revision')::numeric THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF menu_name='fees' AND identity->>'role'<>'PARENT' THEN RAISE EXCEPTION 'FEE_PARENT_REQUIRED'; END IF;
  viewed:=(p->>'revision')::bigint;
  IF viewed>coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu=menu_name),0) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  UPDATE app_private.workspace_menu_updates SET seen_revision=greatest(seen_revision,viewed) WHERE profile_id=who AND menu=menu_name;
  RETURN app_private.workspace_menu_snapshot(who);
 ELSIF op='workspace.updates.status' THEN RETURN app_private.workspace_menu_snapshot(who);
 END IF;
 menu_name:=CASE WHEN op='workspace.chat.list' AND NOT (p?'before') AND coalesce(p->>'query','')='' THEN 'chat'
  WHEN op='workspace.items.list' THEN CASE p->>'kind' WHEN 'REPEAT' THEN 'timetable' WHEN 'EVENT' THEN 'calendar' WHEN 'FEE' THEN 'fees' WHEN 'NOTE' THEN 'records' END END;
 -- Capture before loading content: a later update must survive an older acknowledgement.
 IF menu_name IS NOT NULL THEN
  SELECT revision INTO viewed FROM app_private.workspace_menu_updates WHERE profile_id=who AND menu=menu_name;
  receipt:=jsonb_build_object('profileId',who,'menu',menu_name,'revision',coalesce(viewed,0));
 END IF;
 result:=app_private.workspace_command_v84(op,p);
 RETURN result||CASE WHEN receipt IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('updateReceipt',receipt) END;
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_menu_snapshot(uuid),app_private.workspace_menu_capture(),app_private.workspace_command_v84(text,jsonb),app_private.workspace_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
DO $$ BEGIN EXECUTE format('GRANT EXECUTE ON FUNCTION app_private.workspace_menu_capture() TO %I',current_setting('iharu.migration_executor')); END $$;
RESET ROLE;
CREATE TRIGGER workspace_item_menu_update AFTER INSERT OR UPDATE ON app_private.workspace_items FOR EACH ROW EXECUTE FUNCTION app_private.workspace_menu_capture();
CREATE TRIGGER workspace_family_menu_update AFTER INSERT OR UPDATE ON app_private.workspace_links FOR EACH ROW EXECUTE FUNCTION app_private.workspace_menu_capture();
SET LOCAL ROLE iharu_policy;
DO $$ BEGIN EXECUTE format('REVOKE EXECUTE ON FUNCTION app_private.workspace_menu_capture() FROM %I',current_setting('iharu.migration_executor')); END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
