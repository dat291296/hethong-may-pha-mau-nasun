-- Atomic maintenance completion. Existing business records are preserved.
BEGIN;
CREATE OR REPLACE FUNCTION public.complete_machine_maintenance(
  p_operation_id UUID, p_set_code TEXT, p_date DATE, p_next_date DATE,
  p_notes TEXT, p_photos JSONB, p_has_issues BOOLEAN
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  machine public.system_sets%ROWTYPE;
  audit_id TEXT := 'AUDIT-MAINT-' || p_operation_id::TEXT;
  actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF COALESCE(public.get_my_role(), '') NOT IN ('admin', 'manager', 'technician', 'qc') THEN RAISE EXCEPTION 'FORBIDDEN_MAINTENANCE'; END IF;
  IF p_operation_id IS NULL OR p_date IS NULL OR p_date > (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE OR p_next_date IS NULL OR p_next_date <= p_date
    OR p_notes IS NULL OR LENGTH(p_notes) > 4000 OR LENGTH(p_notes) < 10 OR p_has_issues IS NULL
    OR p_photos IS NULL OR jsonb_typeof(p_photos) <> 'array' THEN RAISE EXCEPTION 'INVALID_MAINTENANCE'; END IF;
  IF jsonb_array_length(p_photos) > 6 OR pg_column_size(p_photos) > 6000000 THEN RAISE EXCEPTION 'INVALID_PHOTOS'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_photos) photo WHERE photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') THEN RAISE EXCEPTION 'INVALID_PHOTOS'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(audit_id, 0));
  SELECT * INTO machine FROM public.system_sets WHERE set_code = p_set_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYSTEM_SET_NOT_FOUND'; END IF;
  IF NOT COALESCE(public.can_access_region(machine.region), FALSE) THEN RAISE EXCEPTION 'FORBIDDEN_REGION'; END IF;
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE id = audit_id AND user_id = auth.uid() AND set_code = p_set_code) THEN
    RETURN jsonb_build_object('id', audit_id, 'saved', TRUE);
  END IF;
  IF public.is_month_locked(p_date) THEN RAISE EXCEPTION 'MONTH_LOCKED'; END IF;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  UPDATE public.system_sets SET
    last_maintenance_date = p_date,
    next_maintenance_due = CASE WHEN p_has_issues THEN next_maintenance_due ELSE p_next_date END,
    status = CASE WHEN p_has_issues THEN 'BAO_THUONG_BAO_TRI' WHEN status = 'BAO_THUONG_BAO_TRI' THEN 'DA_LAP_DAT' ELSE status END,
    installation_photos = COALESCE(installation_photos, '[]'::JSONB) || p_photos
  WHERE set_code = p_set_code;
  INSERT INTO public.audit_logs(id, type, set_code, npp_id, npp_name, serial_list, technician, reason, notes, user_id, severity)
  VALUES(audit_id, 'BẢO TRÌ / SỬA CHỮA', machine.set_code, machine.npp_id, machine.npp_name,
    COALESCE(machine.dispenser_serial, ''), COALESCE(actor, 'Kỹ thuật viên'), 'Checklist bảo trì', p_notes,
    auth.uid(), CASE WHEN p_has_issues THEN 'WARNING' ELSE 'INFO' END);
  RETURN jsonb_build_object('id', audit_id, 'saved', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_machine_maintenance(UUID,TEXT,DATE,DATE,TEXT,JSONB,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_machine_maintenance(UUID,TEXT,DATE,DATE,TEXT,JSONB,BOOLEAN) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
