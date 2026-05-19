-- 022_testimonials.sql
--
-- "Word of Mouth" wall — off-platform social proof captured as screenshots
-- (Instagram DMs, iMessage threads, WhatsApp, etc). Each row is one
-- screenshot we want to display floating on the public /word-of-mouth page.
--
-- Kept deliberately simple: no per-source tables, no joins required to
-- render. Source is just a free-text label (the admin picks from a preset
-- list in the UI but we don't constrain at the DB level so it's easy to add
-- a new platform later without a schema change).

create table if not exists public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  image_url     text not null,
  -- Origin platform — e.g. "Instagram", "iMessage", "WhatsApp", "Email".
  -- Used to pick the small badge icon on the public card.
  source        text,
  -- Optional: who said it (first name or initials, never required).
  customer_name text,
  -- Optional caption / quoted line we want to surface beneath the screenshot.
  caption       text,
  -- Optional link back to the product the buyer was talking about.
  product_id    uuid references public.products(id) on delete set null,
  -- When the message was actually sent. Lets us show real-feeling dates
  -- ("Jan 24") rather than "added to site today".
  posted_at     timestamptz,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists testimonials_active_sort_idx
  on public.testimonials (active, sort_order desc, created_at desc);

alter table public.testimonials enable row level security;

-- Public can read active testimonials only — drafts/hidden rows stay private.
drop policy if exists "testimonials_public_read" on public.testimonials;
create policy "testimonials_public_read"
  on public.testimonials
  for select
  using (active = true);

-- Only signed-in admins can write/modify.
drop policy if exists "testimonials_admin_write" on public.testimonials;
create policy "testimonials_admin_write"
  on public.testimonials
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
