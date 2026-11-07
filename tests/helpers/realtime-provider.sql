-- Isolated provider contract only. Never imported by application code or deployed migrations.
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA realtime;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('realtime.topic',true) $$;
CREATE TABLE realtime.messages(id uuid PRIMARY KEY,payload jsonb NOT NULL,event text NOT NULL,topic text NOT NULL,private boolean NOT NULL,extension text NOT NULL);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime,auth TO authenticated;
GRANT SELECT,INSERT ON realtime.messages TO authenticated;

