BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE machine public.system_sets; item record; count_free integer;
BEGIN
  SELECT * INTO STRICT machine FROM public.system_sets WHERE set_code='SET-2026-104' FOR UPDATE;
  IF machine.npp_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE set_code=machine.set_code AND type='THU HỒI' AND npp_id='NPP-MT-004' AND npp_name='Nguyên Linh') THEN
    RAISE EXCEPTION 'RECONCILIATION_WITHDRAWAL_EVIDENCE_REQUIRED';
  END IF;
  IF machine.status='TRONG_KHO' AND machine.dispenser_id='DISP-067' AND machine.mixer_id='MIXE-066'
    AND machine.computer_id='COMP-047' AND machine.printer_id='PRIN-047' THEN
    UPDATE public.system_sets SET status='DA_THU_HOI' WHERE set_code=machine.set_code;
  ELSIF NOT (machine.status='DA_THU_HOI' AND machine.dispenser_id IS NULL AND machine.mixer_id IS NULL
    AND machine.computer_id IS NULL AND machine.printer_id IS NULL) THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_CHANGED';
  END IF;
  FOR item IN SELECT * FROM (VALUES('dispensers','DISP-067'),('mixers','MIXE-066'),('computers','COMP-047'),('printers','PRIN-047')) kinds(tbl,id) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id=$1 AND set_code IS NULL AND is_assigned=false',item.tbl) INTO count_free USING item.id;
    IF count_free<>1 THEN RAISE EXCEPTION 'RECONCILIATION_INVENTORY_NOT_FREE'; END IF;
  END LOOP;
  INSERT INTO public.audit_logs(id,type,set_code,npp_id,npp_name,serial_list,reason,severity)
  VALUES('AUDIT-RECONCILE-SET-2026-104-20261102','ĐỐI SOÁT THU HỒI',machine.set_code,'NPP-MT-004','Nguyên Linh',
    'DISP-067, MIXE-066, COMP-047, PRIN-047','Release existing audited withdrawal to individual stock; approved maintenance release.','INFO')
  ON CONFLICT(id) DO NOTHING;
END $$;
COMMIT;
