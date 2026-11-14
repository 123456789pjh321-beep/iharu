-- Keep review state and notes private to the viewer, including on shared items.
CREATE TABLE app_private.workspace_timeline_annotations (
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES app_private.workspace_items(id) ON DELETE CASCADE,
 occurrence_date date NOT NULL,
 reviewed boolean NOT NULL DEFAULT false,
 saved boolean NOT NULL DEFAULT false,
 note text NOT NULL DEFAULT '' CHECK (char_length(note)<=2000),
 PRIMARY KEY (profile_id,item_id,occurrence_date)
);
CREATE INDEX workspace_timeline_annotations_item ON app_private.workspace_timeline_annotations(item_id);
ALTER TABLE app_private.workspace_timeline_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.workspace_timeline_annotations FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_timeline_policy ON app_private.workspace_timeline_annotations
 TO iharu_policy USING (true) WITH CHECK (true);
REVOKE ALL ON app_private.workspace_timeline_annotations FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_private.workspace_timeline_annotations TO iharu_policy;

SELECT set_config('iharu.timeline_migration_executor',current_user,true);
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_timeline_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 identity jsonb;
 who uuid;
 can_read_fees boolean;
 lo date;
 hi date;
 day date;
 item app_private.workspace_items%ROWTYPE;
 state app_private.workspace_timeline_annotations%ROWTYPE;
 annotations jsonb;
 items jsonb;
 required_publication uuid;
BEGIN
 identity:=app_private.workspace_command('workspace.me','{}');
 who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 can_read_fees:=identity->>'role'='PARENT';

 IF op='workspace.timeline.read' THEN
  lo:=(p->>'from')::date;
  hi:=(p->>'to')::date;
  IF lo IS NULL OR hi IS NULL OR hi-lo NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  items:=(app_private.workspace_command('workspace.items.list',p||'{"kind":"REPEAT"}')->'items')
      ||(app_private.workspace_command('workspace.items.list',p||'{"kind":"EVENT"}')->'items');
  IF can_read_fees THEN
   items:=items||(app_private.workspace_command('workspace.items.list',p||'{"kind":"FEE"}')->'items');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'itemId',a.item_id,'date',d.day,'reviewed',a.reviewed,'saved',a.saved,'note',a.note
  )),'[]'::jsonb) INTO annotations
  FROM app_private.workspace_timeline_annotations a
  JOIN app_private.workspace_items i ON i.id=a.item_id
  CROSS JOIN LATERAL (SELECT coalesce(nullif(a.occurrence_date,'-infinity'::date),(i.data->>'date')::date) AS day) d
  WHERE a.profile_id=who AND i.deleted_at IS NULL
    AND d.day BETWEEN lo AND hi AND (i.kind<>'FEE' OR can_read_fees)
    AND (a.reviewed OR a.saved OR a.note<>'')
    AND app_private.workspace_can_read(who,i.owner_id);
  RETURN jsonb_build_object('items',items,'annotations',annotations);
 END IF;

 IF op<>'workspace.timeline.annotate' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF (NOT (p ?| ARRAY['reviewed','saved','note']))
   OR (p?'reviewed' AND jsonb_typeof(p->'reviewed')<>'boolean')
   OR (p?'saved' AND jsonb_typeof(p->'saved')<>'boolean')
   OR (p?'note' AND (jsonb_typeof(p->'note')<>'string' OR char_length(p->>'note')>2000))
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF can_read_fees AND (p->>'reviewed'='true' OR p->>'saved'='true' OR coalesce(p->>'note','')<>'') THEN
  PERFORM singleton FROM app_private.legal_settings WHERE singleton FOR SHARE;
  SELECT id INTO required_publication FROM app_private.legal_publications ORDER BY version DESC LIMIT 1;
  IF required_publication IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM app_private.legal_acceptances a
   WHERE a.member_id=app_private.actor() AND a.publication_id=required_publication AND a.withdrawn_at IS NULL
  ) THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'; END IF;
 END IF;
 day:=(p->>'date')::date;
 SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'itemId')::uuid FOR SHARE;
 IF item.id IS NULL OR item.deleted_at IS NOT NULL OR item.kind NOT IN ('REPEAT','EVENT','FEE')
   OR (item.kind='FEE' AND NOT can_read_fees) OR NOT app_private.workspace_can_read(who,item.owner_id)
 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF day IS NULL OR NOT coalesce(CASE item.kind
   WHEN 'REPEAT' THEN item.data->'weekdays' @> to_jsonb(ARRAY[extract(dow FROM day)::int])
   WHEN 'EVENT' THEN app_private.workspace_push_occurs(item.data,day)
   WHEN 'FEE' THEN app_private.workspace_fee_due(item.data,date_trunc('month',day)::date)=day
 END,false) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

 -- One-off entries retain their annotations when the source entry is moved to a different date.
 INSERT INTO app_private.workspace_timeline_annotations AS a (profile_id,item_id,occurrence_date,reviewed,saved,note)
 VALUES (who,item.id,CASE
   WHEN item.kind='REPEAT' OR item.kind='EVENT' AND coalesce(item.data->>'calendarFrequency','ONCE')<>'ONCE'
     OR item.kind='FEE' AND item.data->>'feeFrequency'='MONTHLY' THEN day
   ELSE '-infinity'::date END,
   coalesce((p->>'reviewed')::boolean,false),coalesce((p->>'saved')::boolean,false),coalesce(p->>'note',''))
 ON CONFLICT (profile_id,item_id,occurrence_date) DO UPDATE
 SET reviewed=CASE WHEN p?'reviewed' THEN excluded.reviewed ELSE a.reviewed END,
     saved=CASE WHEN p?'saved' THEN excluded.saved ELSE a.saved END,
     note=CASE WHEN p?'note' THEN excluded.note ELSE a.note END
 RETURNING * INTO state;
 IF NOT state.reviewed AND NOT state.saved AND state.note='' THEN
  DELETE FROM app_private.workspace_timeline_annotations
   WHERE profile_id=who AND item_id=item.id AND occurrence_date=state.occurrence_date;
 END IF;
 RETURN jsonb_build_object('itemId',item.id,'date',day,'reviewed',state.reviewed,'saved',state.saved,'note',state.note);
END $$;

CREATE FUNCTION app_private.workspace_timeline_prune() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 DELETE FROM app_private.workspace_timeline_annotations WHERE item_id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_timeline_command(text,jsonb),app_private.workspace_timeline_prune() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_timeline_command(text,jsonb) TO app_runtime;
DO $$ BEGIN
 EXECUTE format('GRANT EXECUTE ON FUNCTION app_private.workspace_timeline_prune() TO %I',current_setting('iharu.timeline_migration_executor'));
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
CREATE TRIGGER workspace_timeline_source_deleted AFTER UPDATE OF deleted_at ON app_private.workspace_items
 FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
 EXECUTE FUNCTION app_private.workspace_timeline_prune();
