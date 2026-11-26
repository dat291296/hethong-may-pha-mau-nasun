begin;
alter table public.dispensers add column colorant_slots text[];
alter table public.dispensers add constraint dispenser_colorant_slots_valid check (
  colorant_slots is null or (
    nullif(btrim(serial), '') is not null
    and btrim(serial) !~* '^(n/a|—|-|null|undefined|không có seri|auto-.*)$'
    and array_ndims(colorant_slots) = 1 and array_lower(colorant_slots, 1) = 1
    and cardinality(colorant_slots) = 14
    and colorant_slots @> array['AXX','B','C','D','E','F','I','AN','KX','L','RR','RH','T','V']::text[]
  )
);
commit;
