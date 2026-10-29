-- Internal rate-limit configuration must never be caller controlled.
BEGIN;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
