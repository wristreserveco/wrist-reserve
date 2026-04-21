-- 013_rename_reserve_tier.sql
--
-- Rename the premium catalog tier from 'reserve' to 'super_tier' so the DB
-- value matches the public product name ("Super Tier"). Application code
-- was updated in parallel to reference 'super_tier' everywhere.
--
-- Steps:
--   1. Drop the existing check constraint (which still lists 'reserve').
--   2. Rename any rows currently tagged 'reserve' → 'super_tier'.
--   3. Re-add the check constraint with the new vocabulary.
--
-- Idempotent: safe to re-run. If the old constraint or legacy values are
-- already gone, the statements below simply no-op.

-- 1. Drop legacy constraint if it's still around.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'products_tier_check'
  ) then
    alter table public.products drop constraint products_tier_check;
  end if;
end $$;

-- 2. Migrate data. Legacy rows tagged 'reserve' → 'super_tier'.
update public.products
   set tier = 'super_tier'
 where tier = 'reserve';

-- 3. Add the new check constraint reflecting the renamed vocabulary.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_tier_check'
  ) then
    alter table public.products
      add constraint products_tier_check
        check (tier in ('classic', 'super_tier'));
  end if;
end $$;

-- Index is untouched — it's keyed on the column, not the value, so it
-- continues to serve lookups on the new values.
