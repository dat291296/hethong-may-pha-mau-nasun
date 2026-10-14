-- Staging policy/RPC verification with transaction-local role lookup stubs.
-- All fixtures and helper overrides roll back; existing profiles are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT NULLIF(current_setting('verify.role', true), ''); $$;
CREATE OR REPLACE FUNCTION public.get_my_region() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT NULLIF(current_setting('verify.region', true), ''); $$;
DO $$
DECLARE prefix TEXT := 'VERIFY-ACCESS-' || gen_random_uuid()::TEXT; actor UUID;
BEGIN
  SELECT id INTO actor FROM public.profiles LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'STAGING_REQUIRES_FIXTURE_IDENTITY'; END IF;
  PERFORM set_config('verify.actor', actor::TEXT, true);
  PERFORM set_config('verify.prefix', prefix, true);
  PERFORM set_config('verify.role', 'admin', true);
  INSERT INTO public.distributors (id, name, region) VALUES
    (prefix || '-1', 'Synthetic North', 'Miền Bắc'),
    (prefix || '-2', 'Synthetic Central', 'Miền Trung'),
    (prefix || '-3', 'Synthetic South', 'Miền Nam');
  INSERT INTO public.system_sets (set_code, npp_id, npp_name, region, status)
    SELECT id, id, name, region, 'DA_LAP_DAT' FROM public.distributors WHERE id LIKE prefix || '%';
  INSERT INTO public.mixers (id, serial, model, set_code, is_assigned)
    SELECT set_code, set_code, 'KMC', set_code, true FROM public.system_sets WHERE set_code LIKE prefix || '%';
  UPDATE public.system_sets SET mixer_id = set_code, mixer_serial = set_code, mixer_model = 'KMC'
    WHERE set_code LIKE prefix || '%';
  INSERT INTO public.mixers (id, serial, model) VALUES (prefix || '-stock', prefix || '-stock', 'KMC');
  INSERT INTO public.computers (id, serial, type, set_code, is_assigned)
    SELECT set_code, set_code, 'Case', set_code, true FROM public.system_sets WHERE set_code LIKE prefix || '%';
  UPDATE public.system_sets SET computer_id = set_code, computer_serial = set_code, computer_type = 'Case'
    WHERE set_code LIKE prefix || '%';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal2')::TEXT, true);
END;
$$;
DO $$
DECLARE roles TEXT[] := ARRAY['manager', 'technician', 'qc'];
  regions TEXT[] := ARRAY['Miền Bắc', 'Miền Trung', 'Miền Nam'];
  staff_role TEXT; idx INTEGER; affected INTEGER; own_id TEXT; foreign_id TEXT;
  prefix TEXT := current_setting('verify.prefix'); revision TIMESTAMPTZ;
BEGIN
  FOREACH staff_role IN ARRAY roles LOOP
    PERFORM set_config('verify.role', staff_role, true);
    FOR idx IN 1..3 LOOP
      PERFORM set_config('verify.region', regions[idx], true);
      own_id := prefix || '-' || idx;
      foreign_id := prefix || '-' || ((idx % 3) + 1);
      EXECUTE 'SET LOCAL ROLE authenticated';
      UPDATE public.distributors SET name = 'Synthetic own region edit' WHERE id = own_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'OWN_NPP_EDIT_FAILED: %', staff_role; END IF;
      UPDATE public.distributors SET name = 'Forbidden edit' WHERE id = foreign_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 0 THEN RAISE EXCEPTION 'FOREIGN_NPP_EDIT_ALLOWED'; END IF;
      UPDATE public.system_sets SET notes = 'Synthetic own region edit' WHERE set_code = own_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'OWN_SET_EDIT_FAILED'; END IF;
      UPDATE public.system_sets SET notes = 'Forbidden edit' WHERE set_code = foreign_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 0 THEN RAISE EXCEPTION 'FOREIGN_SET_EDIT_ALLOWED'; END IF;
      SELECT updated_at INTO revision FROM public.mixers WHERE id = own_id;
      PERFORM public.edit_device_atomic('mixers', own_id, '{"model":"KMC verified"}'::JSONB, revision);
      IF NOT EXISTS (SELECT 1 FROM public.mixers WHERE id = own_id AND model = 'KMC verified')
        OR NOT EXISTS (SELECT 1 FROM public.system_sets WHERE set_code = own_id AND mixer_model = 'KMC verified') THEN
        RAISE EXCEPTION 'ATOMIC_DEVICE_EDIT_NOT_PERSISTED';
      END IF;
      SELECT updated_at INTO revision FROM public.computers WHERE id = own_id;
      PERFORM public.edit_device_atomic('computers', own_id, '{"tinting_software":"ColorExpert 3","software_version":"3.2"}'::JSONB, revision);
      IF NOT EXISTS (SELECT 1 FROM public.computers WHERE id = own_id AND tinting_software = 'ColorExpert 3' AND software_version = '3.2')
        OR NOT EXISTS (SELECT 1 FROM public.system_sets WHERE set_code = own_id AND tinting_software = 'ColorExpert 3' AND software_version = '3.2') THEN
        RAISE EXCEPTION 'SOFTWARE_DETAILS_NOT_PERSISTED_ATOMICALLY';
      END IF;
      SELECT updated_at INTO revision FROM public.computers WHERE id = own_id;
      PERFORM public.edit_device_atomic('computers', own_id, '{"os":"Windows 11 Pro"}'::JSONB, revision);
      IF NOT EXISTS (SELECT 1 FROM public.system_sets WHERE set_code = own_id AND software_version = '3.2') THEN
        RAISE EXCEPTION 'UNRELATED_COMPUTER_EDIT_ERASED_SOFTWARE';
      END IF;
      BEGIN
        PERFORM public.edit_device_atomic('computers', own_id, jsonb_build_object('software_version', repeat('x', 121)), revision);
        RAISE EXCEPTION 'OVERSIZED_SOFTWARE_DETAILS_ACCEPTED';
      EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
      SELECT updated_at INTO revision FROM public.mixers WHERE id = own_id;
      BEGIN
        -- Timestamp triggers use NOW(), which is fixed within this rollback transaction.
        PERFORM public.edit_device_atomic('mixers', own_id, '{"model":"Stale edit"}'::JSONB, revision - INTERVAL '1 second');
        RAISE EXCEPTION 'STALE_EDIT_ALLOWED';
      EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
      UPDATE public.mixers SET model = 'Forbidden edit' WHERE id IN (foreign_id, prefix || '-stock');
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 0 THEN RAISE EXCEPTION 'FOREIGN_OR_STOCK_DEVICE_EDIT_ALLOWED'; END IF;
      BEGIN
        UPDATE public.system_sets SET region = regions[(idx % 3) + 1] WHERE set_code = own_id;
        RAISE EXCEPTION 'CROSS_REGION_TRANSFER_ALLOWED';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      EXECUTE 'SET LOCAL ROLE postgres';
      BEGIN
        UPDATE public.mixers SET model = 'Forbidden definer edit' WHERE id = foreign_id;
        RAISE EXCEPTION 'DEFINER_BYPASS_ALLOWED';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
    PERFORM set_config('verify.region', 'Toàn Quốc', true);
    IF public.technician_can_write_region('Miền Bắc') THEN RAISE EXCEPTION 'NON_ADMIN_NATIONWIDE_ALLOWED'; END IF;
  END LOOP;
  PERFORM set_config('verify.role', 'viewer', true);
  PERFORM set_config('verify.region', 'Miền Bắc', true);
  IF public.technician_can_write_region('Miền Bắc') THEN RAISE EXCEPTION 'VIEWER_WRITE_ALLOWED'; END IF;
  PERFORM set_config('verify.role', 'admin', true);
  IF NOT public.technician_can_write_region(NULL) THEN RAISE EXCEPTION 'ADMIN_STOCK_ACCESS_DENIED'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: three roles across three regions; NPP, sets and atomic mixer edits; foreign, stock, stale and definer writes blocked; fixtures and role stubs rolled back' AS verification;
