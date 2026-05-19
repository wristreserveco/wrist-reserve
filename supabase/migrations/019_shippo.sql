-- 019_shippo.sql
-- Adds columns the Shippo integration needs on the orders table. Existing
-- columns from migration 010 (`tracking_number`, `tracking_carrier`,
-- `shipped_at`) are reused — these are the Shippo-specific extras.

alter table public.orders
  add column if not exists shippo_label_url    text,
  add column if not exists shippo_transaction_id text,
  add column if not exists shippo_rate_id      text,
  add column if not exists shipping_service    text,
  add column if not exists shipping_cost_cents int,
  add column if not exists tracking_url        text,
  add column if not exists tracking_status     text;

create index if not exists idx_orders_tracking_number
  on public.orders (tracking_number)
  where tracking_number is not null;
