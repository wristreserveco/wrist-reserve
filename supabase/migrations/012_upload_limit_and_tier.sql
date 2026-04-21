-- Wrist Reserve · raise Storage size limit + add product tier
-- Idempotent. Safe to re-run.

-- -----------------------------------------------------------------------------
-- 1. Raise the Supabase Storage bucket size limit for product media.
--    Default is 50 MB which chokes on 4K video. 500 MB is comfortable for
--    anything IG / iPhone throws at us without inviting abuse.
-- -----------------------------------------------------------------------------
update storage.buckets
  set file_size_limit = 524288000 -- 500 MB, in bytes
  where id = 'product-media';

-- -----------------------------------------------------------------------------
-- 2. Product tier: two-tier catalog. `classic` covers the everyday collection,
--    `reserve` is the flagship/top-tier line (shown with a premium badge and a
--    dedicated shop filter). Default is `classic` so legacy rows don't break.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists tier text not null default 'classic';

-- Constrain to known values — but only add the check if it isn't there yet.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_tier_check'
  ) then
    alter table public.products
      add constraint products_tier_check
      check (tier in ('classic', 'reserve'));
  end if;
end $$;

create index if not exists idx_products_tier
  on public.products (tier);
