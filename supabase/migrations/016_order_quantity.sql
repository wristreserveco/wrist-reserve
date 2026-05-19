-- 016_order_quantity.sql
-- Track how many units of a product are on each order so buyers can purchase
-- more than one at a time. Older rows default to 1.

alter table public.orders
  add column if not exists quantity integer not null default 1;

alter table public.orders
  add constraint orders_quantity_positive_chk
  check (quantity >= 1)
  not valid;

-- Validate without blocking existing rows.
alter table public.orders validate constraint orders_quantity_positive_chk;
