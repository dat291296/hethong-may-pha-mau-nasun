begin;
alter table public.dispensers drop constraint dispenser_colorant_slots_valid;
alter table public.dispensers add constraint dispenser_colorant_slots_valid check (
  colorant_slots is null or (
    nullif(btrim(serial), '') is not null
    and btrim(serial) !~* '^(n/a|—|-|null|undefined|không có seri|auto-.*)$'
    and array_ndims(colorant_slots) = 1 and array_lower(colorant_slots, 1) = 1
    and cardinality(colorant_slots) in (14,16)
    and array_position(colorant_slots, null) is null
    and colorant_slots <@ array['','UNUSED','BROKEN','AXX','B','C','D','E','F','I','AN','KX','L','RR','RH','T','V']::text[]
  )
);
commit;
