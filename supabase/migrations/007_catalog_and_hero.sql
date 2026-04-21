-- Wrist Reserve · catalog + hero control
-- Run in Supabase SQL Editor.

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tagline text,
  image_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_sort on public.categories (sort_order);
create index if not exists idx_categories_active on public.categories (active) where active;

alter table public.categories enable row level security;

drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public"
  on public.categories for select
  using (true);

drop policy if exists "categories_mutate_authenticated" on public.categories;
create policy "categories_mutate_authenticated"
  on public.categories for all
  to authenticated
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Hero slides (landing page carousel, admin-controlled)
-- -----------------------------------------------------------------------------
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tagline text,
  image_url text,
  video_url text,
  cta_label text,
  cta_href text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_hero_slides_sort on public.hero_slides (sort_order);

alter table public.hero_slides enable row level security;

drop policy if exists "hero_slides_select_public" on public.hero_slides;
create policy "hero_slides_select_public"
  on public.hero_slides for select
  using (true);

drop policy if exists "hero_slides_mutate_authenticated" on public.hero_slides;
create policy "hero_slides_mutate_authenticated"
  on public.hero_slides for all
  to authenticated
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Product extensions (model, quantity, category reference)
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists model text,
  add column if not exists quantity int not null default 1,
  add column if not exists category_id uuid references public.categories(id) on delete set null;

create index if not exists idx_products_model on public.products (model);
create index if not exists idx_products_category on public.products (category_id);

-- Backfill reasonable quantities on existing rows: 1 if available, 0 if sold.
update public.products
  set quantity = case when status = 'sold' then 0 else 1 end
  where quantity is null;
