-- Curate which sold pieces appear in the homepage "Already on wrists" strip.
-- Default true so existing sold rows keep showing until you turn them off.

alter table public.products
  add column if not exists on_wrist_spotlight boolean not null default true;

comment on column public.products.on_wrist_spotlight is
  'When sold, whether to show this product on the homepage “Already on wrists” section.';
