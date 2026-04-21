-- Wrist Reserve — multi-rail payments
-- Run AFTER 001-003. Safe to re-run (uses IF NOT EXISTS).

alter table public.orders
  add column if not exists payment_method text
    check (payment_method in ('crypto', 'manual', 'stripe')) default 'stripe',
  add column if not exists payment_status text
    check (payment_status in ('pending', 'paid', 'cancelled', 'expired', 'refunded')) default 'paid',
  add column if not exists payment_ref text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists notes text;

create index if not exists idx_orders_payment_status on public.orders (payment_status);
create index if not exists idx_orders_payment_ref on public.orders (payment_ref);

-- Keep inserts behind the service role (our API routes). RLS already blocks public insert.
