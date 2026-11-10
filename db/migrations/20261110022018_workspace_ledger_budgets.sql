-- UI134: budgets belong to the signed-in account, month and exact member selection.
CREATE TABLE app_private.workspace_ledger_budgets (
 profile_id uuid NOT NULL REFERENCES app_private.workspace_profiles(id) ON DELETE CASCADE,
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 member_key text NOT NULL,
 amount bigint NOT NULL CHECK(amount BETWEEN 0 AND 1000000000),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,month,member_key)
);
ALTER TABLE app_private.workspace_ledger_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.workspace_ledger_budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_budget_policy ON app_private.workspace_ledger_budgets TO iharu_policy USING(true) WITH CHECK(true);
REVOKE ALL ON app_private.workspace_ledger_budgets FROM PUBLIC,app_runtime;
GRANT SELECT,INSERT,UPDATE ON app_private.workspace_ledger_budgets TO iharu_policy;
GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.workspace_command(text,jsonb) RENAME TO workspace_command_v133;
REVOKE ALL ON FUNCTION app_private.workspace_command_v133(text,jsonb) FROM PUBLIC,app_runtime;
CREATE FUNCTION app_private.workspace_command(op text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity jsonb; who uuid; targets uuid[]; scope_key text; budget app_private.workspace_ledger_budgets; expected integer; budget_amount bigint;
BEGIN
 IF op NOT IN ('workspace.ledger.budget.read','workspace.ledger.budget.save') THEN RETURN app_private.workspace_command_v133(op,p); END IF;
 identity:=app_private.workspace_command_v133('workspace.me','{}'); who:=(identity->>'id')::uuid;
 IF who IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF identity->>'role'<>'PARENT' THEN RAISE EXCEPTION 'FEE_PARENT_REQUIRED'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['month','memberIds','amount','version']<>'{}'::jsonb
  OR jsonb_typeof(p->'month') IS DISTINCT FROM 'string' OR (p->>'month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  OR jsonb_typeof(p->'memberIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF jsonb_array_length(p->'memberIds') NOT BETWEEN 1 AND 100
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'memberIds') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 BEGIN SELECT array_agg(value::uuid ORDER BY value::uuid) INTO targets FROM jsonb_array_elements_text(p->'memberIds') v(value);
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_INPUT'; END;
 IF (SELECT count(DISTINCT id) FROM unnest(targets) id)<>cardinality(targets) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(targets) t(id) WHERE NOT EXISTS(SELECT 1 FROM app_private.workspace_profiles m WHERE m.id=t.id) OR NOT app_private.workspace_can_read(who,t.id)) THEN RAISE EXCEPTION 'ASSIGNEE_INVALID'; END IF;
 scope_key:=array_to_string(targets,',');
 IF op='workspace.ledger.budget.save' THEN
  IF jsonb_typeof(p->'amount') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'version') IS DISTINCT FROM 'number'
   OR (p->>'amount') !~ '^[0-9]+$' OR (p->>'version') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  BEGIN budget_amount:=(p->>'amount')::bigint; expected:=(p->>'version')::integer;
   EXCEPTION WHEN numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_INPUT'; END;
  IF budget_amount NOT BETWEEN 0 AND 1000000000 OR expected<0 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF expected=0 THEN
   INSERT INTO app_private.workspace_ledger_budgets(profile_id,month,member_key,amount) VALUES(who,p->>'month',scope_key,budget_amount) ON CONFLICT DO NOTHING RETURNING * INTO budget;
  ELSE
   UPDATE app_private.workspace_ledger_budgets SET amount=budget_amount,version=version+1,updated_at=now() WHERE profile_id=who AND month=p->>'month' AND member_key=scope_key AND version=expected RETURNING * INTO budget;
  END IF;
  IF budget.profile_id IS NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 ELSE
  IF p ? 'amount' OR p ? 'version' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO budget FROM app_private.workspace_ledger_budgets WHERE profile_id=who AND month=p->>'month' AND member_key=scope_key;
 END IF;
 RETURN jsonb_build_object('amount',coalesce(budget.amount,0),'version',coalesce(budget.version,0));
END $$;
REVOKE ALL ON FUNCTION app_private.workspace_command(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.workspace_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;
