BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_change_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  record_table text NOT NULL,
  record_id text NOT NULL,
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND changes <> '{}'::jsonb),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS admin_change_audit_created_at_idx
  ON public.admin_change_audit(created_at DESC, id DESC);

ALTER TABLE public.admin_change_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_change_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_change_audit TO authenticated;
CREATE POLICY admin_only_change_audit_read ON public.admin_change_audit
  FOR SELECT TO authenticated USING (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.capture_admin_visible_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  before_row jsonb := to_jsonb(OLD);
  after_row jsonb := to_jsonb(NEW);
  changed jsonb;
  actor uuid := auth.uid();
  row_id text;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  SELECT jsonb_object_agg(key, jsonb_build_object('before', before_row -> key, 'after', after_row -> key))
    INTO changed
    FROM jsonb_each(after_row) AS fields(key, value)
   WHERE key NOT IN ('id','created_at','updated_at','last_updated_at','last_updated_by','record_version',
                     'password','password_hash','email','access_token','refresh_token','secret','totp_secret',
                     'photos','before_photos','after_photos','avatar_url')
     AND before_row -> key IS DISTINCT FROM after_row -> key;

  IF changed IS NULL OR changed = '{}'::jsonb THEN RETURN NEW; END IF;
  row_id := COALESCE(after_row ->> 'id', after_row ->> 'set_code', after_row ->> 'email', 'unknown');
  INSERT INTO public.admin_change_audit(actor_id, record_table, record_id, changes)
  VALUES (actor, TG_TABLE_NAME, row_id, changed);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_admin_visible_changes() FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles','distributors','system_sets','dispensers','mixers','computers','printers',
    'repair_tickets','maintenance_schedules','maintenance_records','formula_versions'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS admin_change_audit_capture ON public.%I', target_table);
      EXECUTE format(
        'CREATE TRIGGER admin_change_audit_capture AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_admin_visible_changes()',
        target_table
      );
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
