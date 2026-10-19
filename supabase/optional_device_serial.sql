BEGIN;
-- NULL represents an unknown serial. Keep uniqueness for every known serial.
ALTER TABLE public.dispensers ALTER COLUMN serial DROP NOT NULL;
ALTER TABLE public.mixers ALTER COLUMN serial DROP NOT NULL;
ALTER TABLE public.printers ALTER COLUMN serial DROP NOT NULL;
ALTER TABLE public.computers ALTER COLUMN serial DROP NOT NULL;
COMMIT;
