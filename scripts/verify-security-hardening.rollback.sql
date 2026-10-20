-- Synthetic staging only. Every write is rolled back, including auth session fixtures.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $$
DECLARE actor uuid; sid uuid:=gen_random_uuid(); tag text:='SYN-SEC-'||gen_random_uuid()::text; claims jsonb; n integer; denied boolean;
 png text:='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1cAAAAASUVORK5CYII=';
BEGIN
 SELECT p.id INTO actor FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.role='technician' AND p.managed_region='Miền Bắc' AND p.is_active
 AND u.raw_app_meta_data->>'nasun_rls_fixture'='true' ORDER BY p.created_at DESC LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'ISOLATED_FIXTURE_REQUIRED'; END IF;
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after) VALUES(sid,actor,now(),now(),now()+interval '1 hour');
 INSERT INTO public.distributors(id,name,region,status) VALUES(tag,'Synthetic north','Miền Bắc','Đang hợp tác'),(tag||'-S','Synthetic south','Miền Nam','Đang hợp tác');
 claims:=jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch FROM now()+interval '1 hour')::bigint,'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch FROM now())::bigint)));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 SET LOCAL ROLE authenticated;
 IF public.has_active_app_session() THEN RAISE EXCEPTION 'UNREGISTERED_SESSION_ACCEPTED'; END IF;
 SELECT count(*) INTO n FROM public.distributors WHERE id=tag;
 IF n<>0 THEN RAISE EXCEPTION 'UNREGISTERED_READ_ALLOWED'; END IF;
 denied:=false;
 BEGIN UPDATE public.distributors SET name='Synthetic forbidden' WHERE id=tag;GET DIAGNOSTICS n=ROW_COUNT;denied:=n=0;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNREGISTERED_WRITE_ALLOWED'; END IF;
 PERFORM public.register_trusted_device_session(tag,'Synthetic rollback session','UTC');
 IF NOT public.has_active_app_session() THEN RAISE EXCEPTION 'VALID_SESSION_DENIED'; END IF;
 SELECT count(*) INTO n FROM public.distributors WHERE id=tag;
 IF n<>1 THEN RAISE EXCEPTION 'VALID_READ_DENIED'; END IF;
 denied:=false;
 BEGIN UPDATE public.distributors SET name='Synthetic forbidden' WHERE id=tag||'-S';GET DIAGNOSTICS n=ROW_COUNT;denied:=n=0;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'CROSS_REGION_WRITE_ALLOWED'; END IF;
 denied:=false;
 BEGIN PERFORM public.require_account_admin_session();EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'ADMIN_ESCALATION_ALLOWED'; END IF;
 IF public.validate_inline_image_list('["data:text/html;base64,U1lOVEhFVElD"]') THEN RAISE EXCEPTION 'HTML_UPLOAD_ALLOWED'; END IF;
 IF public.validate_inline_image_list('["data:image/png;base64,U1lOVEhFVElD"]') THEN RAISE EXCEPTION 'SPOOFED_PNG_ALLOWED'; END IF;
 IF public.validate_inline_image_list(jsonb_build_array(png,png,png,png,png,png,png)) THEN RAISE EXCEPTION 'EXCESS_IMAGES_ALLOWED'; END IF;
 IF NOT public.validate_inline_image_list(jsonb_build_array(png)) THEN RAISE EXCEPTION 'VALID_PNG_DENIED'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.repair_tickets(id,ticket_code,date,technician,npp_id,npp_name,product_category,machine_model,serial_number,photos)
 VALUES(tag,tag,current_date,'Synthetic technician',tag,'Synthetic north','Máy chiết','Synthetic model',tag,'["data:text/html;base64,U1lOVEhFVElD"]');
 EXCEPTION WHEN check_violation THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'DIRECT_UPLOAD_BYPASS'; END IF;
 RESET ROLE;
 UPDATE public.account_sessions SET expires_at=now()-interval '1 minute' WHERE session_id=sid::text;
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.distributors WHERE id=tag;
 IF n<>0 OR public.has_active_app_session() THEN RAISE EXCEPTION 'EXPIRED_SESSION_READ_ALLOWED'; END IF;
 IF (public.register_trusted_device_session(tag,'Synthetic rollback session','UTC')->>'valid')::boolean THEN RAISE EXCEPTION 'EXPIRED_SESSION_REVIVED'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE public.account_sessions SET expires_at=now()+interval '1 hour',idle_expires_at=now()+interval '1 hour' WHERE session_id=sid::text;
 claims:=jsonb_set(claims,'{exp}',to_jsonb(extract(epoch FROM now()-interval '1 minute')::bigint));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 SET LOCAL ROLE authenticated;
 IF public.has_valid_auth_session() THEN RAISE EXCEPTION 'EXPIRED_JWT_ACCEPTED'; END IF;
 RESET ROLE;PERFORM set_config('request.jwt.claims','{}',true);
 IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('distributors','system_sets','repair_tickets','computers','mixers','printers','dispensers') AND has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'TRUNCATE')) THEN RAISE EXCEPTION 'EXCESS_TRUNCATE_GRANT'; END IF;
END $$;
ROLLBACK;
