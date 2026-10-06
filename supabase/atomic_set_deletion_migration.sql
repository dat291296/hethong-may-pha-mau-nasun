-- Apply after workflow_transactions_migration.sql and security audit migrations.
-- Installing this migration does not delete existing business records.
BEGIN;

CREATE TABLE IF NOT EXISTS public.set_deletion_operations (
  operation_id TEXT PRIMARY KEY,
  set_code TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.set_deletion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.set_deletion_operations FROM anon;
GRANT SELECT, INSERT ON public.set_deletion_operations TO authenticated;
DROP POLICY IF EXISTS set_deletion_admin ON public.set_deletion_operations;
CREATE POLICY set_deletion_admin ON public.set_deletion_operations TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin' AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.release_deleted_set_devices()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF public.is_month_locked(OLD.install_date) THEN RAISE EXCEPTION 'MONTH_LOCKED'; END IF;
  UPDATE public.dispensers SET is_assigned = FALSE, set_code = NULL WHERE set_code = OLD.set_code;
  UPDATE public.mixers SET is_assigned = FALSE, set_code = NULL WHERE set_code = OLD.set_code;
  UPDATE public.computers SET is_assigned = FALSE, set_code = NULL WHERE set_code = OLD.set_code;
  UPDATE public.printers SET is_assigned = FALSE, set_code = NULL WHERE set_code = OLD.set_code;
  PERFORM public.create_audit_log(jsonb_build_object(
    'id', 'AUDIT-DELETE-SET-' || txid_current()::TEXT || '-' || OLD.set_code,
    'type', 'XÓA BỘ MÁY', 'set_code', OLD.set_code,
    'npp_id', COALESCE(OLD.npp_id, '—'), 'npp_name', OLD.npp_name,
    'serial_list', CONCAT_WS(', ', OLD.dispenser_serial, OLD.mixer_serial, OLD.computer_serial, OLD.printer_serial),
    'reason', 'Xóa bộ máy và giải phóng thiết bị trong cùng giao dịch',
    'severity', 'WARNING'
  ));
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_deleted_set_devices() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS release_deleted_set_devices ON public.system_sets;
CREATE TRIGGER release_deleted_set_devices BEFORE DELETE ON public.system_sets
FOR EACH ROW EXECUTE FUNCTION public.release_deleted_set_devices();

CREATE OR REPLACE FUNCTION public.delete_system_set_atomic(p_operation_id TEXT, p_set_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  receipt public.set_deletion_operations%ROWTYPE;
  deleted_count INTEGER;
  result JSONB;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF NULLIF(BTRIM(p_operation_id), '') IS NULL OR LENGTH(p_operation_id) > 200
    OR NULLIF(BTRIM(p_set_code), '') IS NULL OR LENGTH(p_set_code) > 200 THEN
    RAISE EXCEPTION 'INVALID_DELETE_PAYLOAD';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('delete-set:' || p_operation_id, 0));
  SELECT * INTO receipt FROM public.set_deletion_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF receipt.set_code IS DISTINCT FROM p_set_code OR receipt.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'OPERATION_PAYLOAD_MISMATCH';
    END IF;
    RETURN receipt.result;
  END IF;
  DELETE FROM public.system_sets WHERE set_code = p_set_code;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  result := jsonb_build_object('ok', TRUE, 'deleted', deleted_count, 'setCode', p_set_code);
  INSERT INTO public.set_deletion_operations(operation_id, set_code, user_id, result)
    VALUES(p_operation_id, p_set_code, auth.uid(), result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_system_set_atomic(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_system_set_atomic(TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
