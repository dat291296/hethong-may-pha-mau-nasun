BEGIN;

-- Release physical inventory before the parent leaves its original region.
-- Invoker rights preserve existing staff, session and regional write guards.
CREATE OR REPLACE FUNCTION public.release_withdrawn_set_devices()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE item record; linked record; owners integer; changed integer;
BEGIN
  IF NEW.npp_id IS NOT NULL OR NEW.status NOT IN ('TRONG_KHO','DA_THU_HOI')
     OR NOT (OLD.npp_id IS NOT NULL OR OLD.status IN ('DA_LAP_DAT','BAO_THUONG_BAO_TRI')
       OR (OLD.status='TRONG_KHO' AND NEW.status='DA_THU_HOI' AND EXISTS
         (SELECT 1 FROM public.audit_logs WHERE set_code=OLD.set_code AND type='THU HỒI'))) THEN
    RETURN NEW;
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('dispensers','dispenser_id',OLD.dispenser_id),
    ('mixers','mixer_id',OLD.mixer_id),
    ('computers','computer_id',OLD.computer_id),
    ('printers','printer_id',OLD.printer_id)
  ) AS kinds(table_name,field_name,device_id) LOOP
    FOR linked IN EXECUTE format('SELECT id,set_code FROM public.%I WHERE id=$1 OR set_code=$2 ORDER BY id FOR UPDATE',item.table_name)
      USING item.device_id,OLD.set_code LOOP
      IF linked.set_code IS NOT NULL AND linked.set_code<>OLD.set_code THEN
        RAISE EXCEPTION 'WITHDRAW_DEVICE_LINK_CONFLICT' USING ERRCODE='23514';
      END IF;
      EXECUTE format('SELECT count(*) FROM public.system_sets WHERE %I=$1 AND set_code<>$2',item.field_name)
        INTO owners USING linked.id,OLD.set_code;
      IF owners<>0 THEN RAISE EXCEPTION 'WITHDRAW_DEVICE_SHARED_REFERENCE' USING ERRCODE='23514'; END IF;
      EXECUTE format('UPDATE public.%I SET set_code=NULL,is_assigned=false,updated_at=clock_timestamp() WHERE id=$1',item.table_name) USING linked.id;
      GET DIAGNOSTICS changed=ROW_COUNT;
      IF changed<>1 THEN RAISE EXCEPTION 'WITHDRAW_DEVICE_RELEASE_DENIED' USING ERRCODE='42501'; END IF;
    END LOOP;
  END LOOP;
  -- Keep serial/model snapshots and audit history, but remove live ownership.
  NEW.dispenser_id:=NULL; NEW.mixer_id:=NULL; NEW.computer_id:=NULL; NEW.printer_id:=NULL;
  NEW.status:='DA_THU_HOI';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.release_withdrawn_set_devices() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS release_withdrawn_set_devices ON public.system_sets;
CREATE TRIGGER release_withdrawn_set_devices BEFORE UPDATE ON public.system_sets
FOR EACH ROW EXECUTE FUNCTION public.release_withdrawn_set_devices();
NOTIFY pgrst,'reload schema';
COMMIT;
