CREATE OR REPLACE FUNCTION public.generate_npp_qr_token()
RETURNS text LANGUAGE sql VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $$
 SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(extensions.gen_random_bytes(10), i - 1) & 31) + 1, 1), '')
 FROM generate_series(1,10) AS s(i);
$$;
ALTER TABLE public.distributors ALTER COLUMN qr_token SET DEFAULT public.generate_npp_qr_token();
