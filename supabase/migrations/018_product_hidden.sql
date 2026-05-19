-- 018_product_hidden.sql
-- Adds a `hidden` boolean so admins can temporarily take a product off
-- the public site without deleting it (useful for staging Seikos while
-- real inventory spins up, etc.).
alter table public.products
  add column if not exists hidden boolean not null default false;

create index if not exists products_hidden_idx
  on public.products (hidden)
  where hidden = false;
