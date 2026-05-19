-- =====================================================================
-- 023_admin_audit_log.sql
--
-- Immutable record of every admin action taken on the site. Powers:
--   - "Who deleted this product?" / "Who refunded that order?" forensics
--   - Insurance + chargeback evidence ("admin marked paid at 12:04 UTC")
--   - Tampering detection (insert-only via RLS; updates/deletes are denied)
--
-- Designed to be cheap to write (one row per action), permissive to read
-- (admins only), and impossible to mutate after the fact.
-- =====================================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- WHO took the action. user_id is FK-soft (no constraint) so deleting a
  -- user account doesn't cascade and wipe the audit trail.
  actor_id uuid,
  actor_email text,

  -- WHERE they were when they did it. Captured from the request headers
  -- at write time; trustworthy for forensics, not for blocking.
  actor_ip text,
  user_agent text,

  -- WHAT they did. A short verb-noun string e.g. "product.update",
  -- "order.refund", "review.delete", "testimonial.create". Free-form
  -- on purpose — adding new event types should never require a migration.
  kind text not null,

  -- WHAT they did it TO. Optional FK target description.
  target_kind text,           -- "product" | "order" | "review" | …
  target_id text,             -- the row id (string-typed; could be uuid or external)

  -- HUMAN-READABLE summary. Renders nicely in admin UI without joins.
  message text,

  -- STRUCTURED context. before/after snapshots, amounts, ids, etc.
  metadata jsonb default '{}'::jsonb
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_id_idx
  on public.admin_audit_log (actor_id);
create index if not exists admin_audit_log_kind_idx
  on public.admin_audit_log (kind);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_kind, target_id);

-- ---------------------------------------------------------------------
-- RLS: any authenticated user can SELECT (admin pages run authenticated),
-- only the service role can INSERT (server-side helper), and nobody can
-- UPDATE or DELETE — the table is append-only by policy.
-- ---------------------------------------------------------------------
alter table public.admin_audit_log enable row level security;

drop policy if exists "audit_log_select_authenticated" on public.admin_audit_log;
create policy "audit_log_select_authenticated"
  on public.admin_audit_log
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "audit_log_insert_service_only" on public.admin_audit_log;
create policy "audit_log_insert_service_only"
  on public.admin_audit_log
  for insert
  with check (auth.role() = 'service_role');

-- No UPDATE / DELETE policies defined → both are denied by default with
-- RLS enabled. This is the whole point: nothing in the audit trail can
-- ever be rewritten, even by an admin who's been compromised.
