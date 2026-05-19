-- 017_product_reviews.sql
-- Public reviews for each product. Auto-approved by default so they show
-- instantly; admin can delete/hide any row from the admin panel.

create table if not exists public.product_reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null,
  email       text,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null,
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists product_reviews_product_id_idx
  on public.product_reviews (product_id, created_at desc);

alter table public.product_reviews enable row level security;

-- Anyone can read approved reviews.
drop policy if exists "reviews_public_read" on public.product_reviews;
create policy "reviews_public_read"
  on public.product_reviews
  for select
  using (approved = true);

-- Anyone can insert a review (spam prevention happens server-side through
-- the API route which does rate-limiting / honeypot validation).
drop policy if exists "reviews_public_insert" on public.product_reviews;
create policy "reviews_public_insert"
  on public.product_reviews
  for insert
  with check (true);

-- Only authenticated users (admins) can delete or modify.
drop policy if exists "reviews_admin_modify" on public.product_reviews;
create policy "reviews_admin_modify"
  on public.product_reviews
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
