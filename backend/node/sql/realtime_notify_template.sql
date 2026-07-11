-- GraphCore realtime CDC via trigger → NOTIFY (LISTEN channel: graphcore_changes).
-- Applied on provision; re-run graphcore_attach_realtime_triggers() after CREATE TABLE
-- if the event trigger is unavailable (non-superuser).
--
-- LIMIT: This is NOT wal2json / logical replication. Large row payloads are truncated
-- to stay under pg_notify ~8KB. For full CDC, enable logical decoding separately.

CREATE OR REPLACE FUNCTION public.graphcore_notify_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload jsonb;
  row_data jsonb;
  payload_text text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;

  payload := jsonb_build_object(
    'type', lower(TG_OP),
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'details', TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    'data', row_data,
    'at', now(),
    'cdc', 'trigger_notify'
  );

  payload_text := payload::text;
  IF octet_length(payload_text) > 7800 THEN
    payload := jsonb_build_object(
      'type', lower(TG_OP),
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'details', TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
      'data', jsonb_build_object('_truncated', true),
      'at', now(),
      'cdc', 'trigger_notify'
    );
    payload_text := payload::text;
  END IF;

  PERFORM pg_notify('graphcore_changes', payload_text);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.graphcore_attach_realtime_triggers()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  attached integer := 0;
  tname text;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE '\_%' ESCAPE '\'
  LOOP
    tname := r.table_name;
    EXECUTE format('DROP TRIGGER IF EXISTS graphcore_realtime_aiud ON public.%I', tname);
    EXECUTE format(
      'CREATE TRIGGER graphcore_realtime_aiud
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE PROCEDURE public.graphcore_notify_change()',
      tname
    );
    attached := attached + 1;
  END LOOP;
  RETURN attached;
END;
$$;

-- Auto-attach when new public tables are created (requires owner/superuser privileges).
CREATE OR REPLACE FUNCTION public.graphcore_on_ddl_end()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
  LOOP
    PERFORM public.graphcore_attach_realtime_triggers();
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger WHERE evtname = 'graphcore_realtime_ddl'
  ) THEN
    CREATE EVENT TRIGGER graphcore_realtime_ddl
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE')
      EXECUTE PROCEDURE public.graphcore_on_ddl_end();
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'graphcore: event trigger skipped (need superuser); call graphcore_attach_realtime_triggers() after CREATE TABLE';
  WHEN OTHERS THEN
    RAISE NOTICE 'graphcore: event trigger skipped: %', SQLERRM;
END;
$$;

SELECT public.graphcore_attach_realtime_triggers();
