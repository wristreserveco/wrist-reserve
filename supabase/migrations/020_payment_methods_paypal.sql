-- 020_payment_methods_paypal.sql
--
-- We are deprecating Stripe and the manual rails (Zelle / Cash App / wire /
-- Square / Apple Cash). Going forward Wrist Reserve only accepts:
--
--   * 'paypal' — PayPal Orders v2 (cards, Apple Pay, PayPal balance)
--   * 'crypto' — NOWPayments
--
-- This migration:
--   1. Updates the CHECK constraint to allow the new value 'paypal'.
--   2. Keeps the legacy values ('stripe', 'manual') accepted so historical
--      orders remain valid — we never delete past data.
--   3. Switches the column default from 'stripe' to 'paypal' so any new
--      rows created without an explicit method land in the right bucket.

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
    check (payment_method in ('paypal', 'crypto', 'stripe', 'manual'));

alter table public.orders
  alter column payment_method set default 'paypal';
