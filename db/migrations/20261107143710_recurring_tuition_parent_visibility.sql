-- UI80: parent-only tuition, recurring due dates and independent monthly payments.
CREATE TABLE app_private.workspace_fee_payments (
 item_id uuid NOT NULL REFERENCES app_private.workspace_items(id),
 due_month date NOT NULL CHECK(extract(day FROM due_month)=1),
 paid boolean NOT NULL DEFAULT false,
 marked_by uuid NOT NULL REFERENCES app_private.workspace_profiles(id),
 marked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,due_month)
);
CREATE INDEX workspace_fee_payments_marker ON app_private.workspace_fee_payments(marked_by);
ALTER TABLE app_private.workspace_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.workspace_fee_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_fee_policy ON app_private.workspace_fee_payments TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.workspace_fee_payments FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE ON app_private.workspace_fee_payments TO iharu_policy;
-- Existing one-off paid flags retain their original month only.
INSERT INTO app_private.workspace_fee_payments(item_id,due_month,paid,marked_by,marked_at)
 SELECT id,date_trunc('month',(data->>'date')::date)::date,true,owner_id,updated_at
 FROM app_private.workspace_items WHERE kind='FEE' AND data->>'paid'='true';
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
CREATE FUNCTION app_private.workspace_fee_due(d jsonb,m date) RETURNS date
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE anchor date:=(d->>'date')::date; due date;
BEGIN
 IF coalesce(d->>'feeFrequency','ONCE')='MONTHLY' THEN
  due:=m+(least(extract(day FROM anchor)::int,extract(day FROM m+interval '1 month - 1 day')::int)-1);
 ELSE due:=anchor; END IF;
 IF date_trunc('month',due)::date<>m OR due<anchor OR (nullif(d->>'untilDate','') IS NOT NULL AND due>(d->>'untilDate')::date) THEN RETURN NULL; END IF;
 RETURN due;
END $$;
CREATE FUNCTION app_private.workspace_fee_dto(who uuid,i app_private.workspace_items,m date) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',i.id,'kind',i.kind,'data',i.data,'ownerId',i.owner_id,'ownerName',author.name,'mine',who=i.owner_id,'version',i.version,
  'fee',jsonb_build_object('month',to_char(m,'YYYY-MM'),'dueDate',app_private.workspace_fee_due(i.data,m),
   'paid',coalesce(payment.paid,false),'payerId',coalesce(nullif(i.data->>'feePayerId','')::uuid,i.owner_id),
   'payerName',CASE WHEN payer.kind<>'PARENT' THEN '결제자 미지정' WHEN app_private.workspace_can_read(who,payer.id) THEN payer.name ELSE '연결 해제된 부모' END,
   'canMarkPaid',who=i.owner_id OR (who=payer.id AND app_private.workspace_can_read(who,i.owner_id))))
 FROM app_private.workspace_profiles author
 LEFT JOIN app_private.workspace_profiles payer ON payer.id=coalesce(nullif(i.data->>'feePayerId','')::uuid,i.owner_id)
 LEFT JOIN app_private.workspace_fee_payments payment ON payment.item_id=i.id AND payment.due_month=m
 WHERE author.id=i.owner_id
$$;
REVOKE ALL ON FUNCTION app_private.workspace_fee_due(jsonb,date),app_private.workspace_fee_dto(uuid,app_private.workspace_items,date) FROM PUBLIC,app_runtime;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v78;
REVOKE ALL ON FUNCTION app_private.workspace_command_v78(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; item app_private.workspace_items%ROWTYPE; d jsonb; result jsonb; fees jsonb;
 payer uuid; m date; due date; fid uuid; start_date date; end_date date;
BEGIN
 IF op NOT IN ('workspace.items.list','workspace.items.get','workspace.items.create','workspace.items.update','workspace.items.delete','workspace.fees.payment') THEN
  RETURN app_private.workspace_command_v78(op,p);
 END IF;
 identity:=app_private.workspace_command_v78('workspace.me','{}');who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF op='workspace.items.list' THEN
  start_date:=(p->>'from')::date;end_date:=(p->>'to')::date;
  IF start_date IS NULL OR end_date IS NULL OR end_date<start_date OR end_date-start_date>370 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  result:=app_private.workspace_command_v78(op,p);
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO result FROM jsonb_array_elements(result->'items') WHERE value->>'kind'<>'FEE';
  IF identity->>'role'='PARENT' AND coalesce(p->>'kind','FEE')='FEE' THEN
   SELECT coalesce(jsonb_agg(app_private.workspace_fee_dto(who,i,months.m::date) ORDER BY app_private.workspace_fee_due(i.data,months.m::date),i.created_at),'[]'::jsonb) INTO fees
   FROM app_private.workspace_items i CROSS JOIN generate_series(date_trunc('month',start_date::timestamp),date_trunc('month',end_date::timestamp),interval '1 month') months(m)
   WHERE i.kind='FEE' AND i.deleted_at IS NULL AND app_private.workspace_can_read(who,i.owner_id)
   AND app_private.workspace_fee_due(i.data,months.m::date) BETWEEN start_date AND end_date;
   result:=result||fees;
  END IF;
  RETURN jsonb_build_object('items',result);
 END IF;
 IF op<>'workspace.items.create' THEN
  IF op='workspace.items.get' THEN
   SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'id')::uuid AND deleted_at IS NULL;
  ELSE
   -- Family membership changes serialize with payer writes.
   SELECT f.id INTO fid FROM app_private.workspace_families f JOIN app_private.workspace_links l ON l.family_id=f.id WHERE l.profile_id=who AND l.active FOR SHARE OF f;
   SELECT * INTO item FROM app_private.workspace_items WHERE id=(p->>'id')::uuid AND deleted_at IS NULL FOR UPDATE;
  END IF;
  IF item.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 END IF;
 IF item.kind='FEE' OR p->>'kind'='FEE' OR op='workspace.fees.payment' THEN
  IF identity->>'role'<>'PARENT' THEN RAISE EXCEPTION 'FEE_PARENT_REQUIRED'; END IF;
 ELSE RETURN app_private.workspace_command_v78(op,p); END IF;
 IF op='workspace.items.get' THEN
  IF NOT app_private.workspace_can_read(who,item.owner_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN app_private.workspace_fee_dto(who,item,date_trunc('month',(item.data->>'date')::date)::date);
 ELSIF op='workspace.fees.payment' THEN
  IF item.kind<>'FEE' OR NOT app_private.workspace_can_read(who,item.owner_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF who<>item.owner_id AND who<>coalesce(nullif(item.data->>'feePayerId','')::uuid,item.owner_id) THEN RAISE EXCEPTION 'FEE_PAYER_ONLY'; END IF;
  IF item.version IS DISTINCT FROM (p->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF coalesce(p->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p->'paid') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  m:=((p->>'month')||'-01')::date;due:=app_private.workspace_fee_due(item.data,m);
  IF due IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO app_private.workspace_fee_payments(item_id,due_month,paid,marked_by) VALUES(item.id,m,(p->>'paid')::boolean,who)
   ON CONFLICT(item_id,due_month) DO UPDATE SET paid=excluded.paid,marked_by=excluded.marked_by,marked_at=now();
  UPDATE app_private.workspace_items SET version=version+1,updated_at=now(),data=CASE WHEN m=date_trunc('month',(data->>'date')::date)::date THEN jsonb_set(data,'{paid}',p->'paid') ELSE data END WHERE id=item.id RETURNING version INTO item.version;
  RETURN jsonb_build_object('id',item.id,'version',item.version);
 ELSIF op='workspace.items.delete' THEN RETURN app_private.workspace_command_v78(op,p);
 END IF;
 IF op='workspace.items.update' THEN
  IF item.owner_id<>who THEN RAISE EXCEPTION 'AUTHOR_ONLY'; END IF;
  IF item.kind<>p->>'kind' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 END IF;
 d:=p->'data';
 IF op='workspace.items.update' AND NOT (d?'feeFrequency') AND item.data->>'feeFrequency'='MONTHLY' AND NOT (d?'untilDate') AND item.data?'untilDate' THEN d:=d||jsonb_build_object('untilDate',item.data->'untilDate'); END IF;
 d:=d||jsonb_build_object('feeFrequency',coalesce(d->>'feeFrequency',item.data->>'feeFrequency','ONCE'),'feePayerId',coalesce(d->>'feePayerId',item.data->>'feePayerId',who::text));
 IF d->>'feeFrequency' NOT IN ('ONCE','MONTHLY') OR jsonb_typeof(d->'amount') IS DISTINCT FROM 'number' OR (d->>'amount')::numeric NOT BETWEEN 0 AND 1000000000 OR trunc((d->>'amount')::numeric)<>(d->>'amount')::numeric THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF nullif(d->>'untilDate','') IS NOT NULL AND (d->>'untilDate')::date<(d->>'date')::date THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF d->>'feeFrequency'='ONCE' THEN d:=d-'untilDate'; END IF;
 payer:=(d->>'feePayerId')::uuid;
 SELECT f.id INTO fid FROM app_private.workspace_families f JOIN app_private.workspace_links l ON l.family_id=f.id WHERE l.profile_id=who AND l.active FOR SHARE OF f;
 IF NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles pp WHERE pp.id=payer AND pp.kind='PARENT' AND (payer=who OR EXISTS(SELECT 1 FROM app_private.workspace_links l WHERE l.profile_id=payer AND l.family_id=fid AND l.active))) THEN RAISE EXCEPTION 'FEE_PAYER_INVALID'; END IF;
 result:=app_private.workspace_command_v78(op,jsonb_set(p,'{data}',d));
 -- Legacy one-off clients can still use their original paid flag.
 IF (op='workspace.items.create' AND coalesce((d->>'paid')::boolean,false)) OR (op='workspace.items.update' AND NOT (p->'data'?'feeFrequency') AND d->'paid' IS DISTINCT FROM item.data->'paid') THEN
  INSERT INTO app_private.workspace_fee_payments(item_id,due_month,paid,marked_by) VALUES((result->>'id')::uuid,date_trunc('month',(d->>'date')::date)::date,coalesce((d->>'paid')::boolean,false),who)
   ON CONFLICT(item_id,due_month) DO UPDATE SET paid=excluded.paid,marked_by=excluded.marked_by,marked_at=now();
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
