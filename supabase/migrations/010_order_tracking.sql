-- Wrist Reserve · order tracking + proof of payment + audit log
-- Run in Supabase SQL Editor. Safe to re-run.

-- -----------------------------------------------------------------------------
-- Orders: proof of payment, fulfillment, admin notes, timestamps
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_address text,
  add column if not exists proof_url text,
  add column if not exists proof_mime text,
  add column if not exists proof_uploaded_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text,
  add column if not exists admin_notes text;

create index if not exists idx_orders_status_created
  on public.orders (payment_status, created_at desc);
create index if not exists idx_orders_pending
  on public.orders (created_at desc)
  where payment_status = 'pending';

-- -----------------------------------------------------------------------------
-- order_events: append-only audit log for every state change / buyer action
-- -----------------------------------------------------------------------------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null,
  message text,
  actor text not null default 'system',  -- 'system' | 'buyer' | 'admin'
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order_id
  on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;

-- Service role always works; authenticated admins get full read access.
drop policy if exists "order_events_select_authenticated" on public.order_events;
create policy "order_events_select_authenticated"
  on public.order_events for select
  to authenticated
  using (true);

-- Buyer-initiated events (like "proof uploaded") are inserted via service-role
-- API routes, not directly from the client — so no public insert policy needed.
