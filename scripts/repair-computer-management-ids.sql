-- Approved correction: MIXE-061..076 -> COMP-087..102, preserving device data and links.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.computers, public.system_sets IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE computer_code_map(old_id text PRIMARY KEY,new_id text UNIQUE) ON COMMIT DROP;
INSERT INTO computer_code_map SELECT 'MIXE-'||lpad(n::text,3,'0'),'COMP-'||lpad((n+26)::text,3,'0') FROM generate_series(61,76) n;
CREATE TEMP TABLE computer_code_baseline(kind text,content jsonb) ON COMMIT DROP;
INSERT INTO computer_code_baseline SELECT 'computers',coalesce(jsonb_agg((to_jsonb(c)-'updated_at'-'id')||jsonb_build_object('id',coalesce(m.new_id,c.id)) ORDER BY coalesce(m.new_id,c.id)),'[]') FROM public.computers c LEFT JOIN computer_code_map m ON c.id=m.old_id;
INSERT INTO computer_code_baseline SELECT 'sets',coalesce(jsonb_agg((to_jsonb(s)-'updated_at'-'computer_id')||jsonb_build_object('computer_id',coalesce(m.new_id,s.computer_id)) ORDER BY s.set_code),'[]') FROM public.system_sets s LEFT JOIN computer_code_map m ON s.computer_id=m.old_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM computer_code_map m JOIN public.computers c ON c.id=m.new_id) THEN RAISE EXCEPTION 'TARGET_CODE_ALREADY_EXISTS'; END IF;
 IF (SELECT count(*) FROM public.computers c JOIN computer_code_map m ON c.id=m.old_id) <> 16 THEN RAISE EXCEPTION 'EXPECTED_16_SOURCE_COMPUTERS'; END IF;
END $$;
UPDATE public.computers c SET id=m.new_id FROM computer_code_map m WHERE c.id=m.old_id;
UPDATE public.system_sets s SET computer_id=m.new_id FROM computer_code_map m WHERE s.computer_id=m.old_id;
DO $$ DECLARE actual jsonb; BEGIN
 SELECT coalesce(jsonb_agg(to_jsonb(c)-'updated_at' ORDER BY c.id),'[]') INTO actual FROM public.computers c;
 IF actual IS DISTINCT FROM (SELECT content FROM computer_code_baseline WHERE kind='computers') THEN RAISE EXCEPTION 'COMPUTER_CONTENT_PRESERVATION_FAILED'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)-'updated_at' ORDER BY s.set_code),'[]') INTO actual FROM public.system_sets s;
 IF actual IS DISTINCT FROM (SELECT content FROM computer_code_baseline WHERE kind='sets') THEN RAISE EXCEPTION 'SET_LINK_PRESERVATION_FAILED'; END IF;
 IF (SELECT count(*) FROM public.computers c JOIN computer_code_map m ON c.id=m.new_id) <> 16 THEN RAISE EXCEPTION 'EXPECTED_16_RENAMED_COMPUTERS'; END IF;
END $$;
INSERT INTO public.audit_logs(id,type,technician,reason,notes,severity)
VALUES('AUDIT-COMPUTER-CODES-20261017','SỬA MÃ QUẢN LÝ MÁY TÍNH','System maintenance','Correct 16 computer management codes as requested by the owner','MIXE-061..MIXE-076 -> COMP-087..COMP-102; original equipment data and system set links verified unchanged.','WARNING');
COMMIT;
