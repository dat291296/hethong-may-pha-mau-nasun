BEGIN;
-- Data releases are retained. Reassigning returned inventory requires a new assembly.
DROP TRIGGER IF EXISTS release_withdrawn_set_devices ON public.system_sets;
DROP FUNCTION IF EXISTS public.release_withdrawn_set_devices();
COMMIT;
