-- Reject writes by explicitly revoked or expired registered sessions.
-- Existing rows and unregistered legacy sessions are preserved.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_revoked_session_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_session public.account_sessions%ROWTYPE;
  jwt jsonb := auth.jwt();
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO current_session FROM public.account_sessions
      WHERE session_id = jwt->>'session_id' AND user_id = auth.uid() FOR SHARE;
    IF FOUND AND (current_session.revoked_at IS NOT NULL OR current_session.expires_at <= NOW()
      OR current_session.idle_expires_at <= NOW()
      OR EXISTS (SELECT 1 FROM public.trusted_devices WHERE id = current_session.trusted_device_id
        AND (revoked_at IS NOT NULL OR trusted_until <= NOW()))) THEN
      RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_revoked_session_write() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['distributors','system_sets','dispensers','mixers','computers','printers','repair_tickets','audit_logs','profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_revoked_session_write ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER guard_revoked_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_revoked_session_write()',table_name);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
