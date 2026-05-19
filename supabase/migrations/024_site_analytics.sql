-- =====================================================================
-- 024_site_analytics.sql
--
-- First-party storefront analytics: sessions, page views, dwell / engaged
-- time, acquisition params, and light CRM fields for marketing follow-up.
--
-- Writes go only through Next.js API routes (service role). RLS enabled
-- with zero policies → no direct PostgREST access for anon/auth.
-- =====================================================================

create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Stable IDs generated in the browser (UUID strings).
  session_public_id text not null unique,
  visitor_id text not null,

  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),

  landing_path text,
  landing_query text,
  exit_path text,
  referrer text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  user_agent text,
  client_ip text,
  viewport_w int,
  viewport_h int,
  browser_language text,
  timezone text,

  page_view_count int not null default 0,
  engaged_ms bigint not null default 0,

  auth_user_id uuid,

  -- Optional marketing / CRM (never auto-scrape; admin or explicit capture flows).
  capture_email text,
  capture_name text,
  marketing_opt_in boolean not null default false,
  admin_notes text,
  admin_tags text[] not null default '{}'::text[]
);

create index if not exists analytics_sessions_started_at_idx
  on public.analytics_sessions (started_at desc);
create index if not exists analytics_sessions_last_activity_idx
  on public.analytics_sessions (last_activity_at desc);
create index if not exists analytics_sessions_visitor_idx
  on public.analytics_sessions (visitor_id);

create table if not exists public.analytics_page_views (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  path text not null,
  query_string text,
  title text,
  product_id text,
  viewed_at timestamptz not null default now(),
  dwell_ms int
);

create index if not exists analytics_page_views_session_viewed_idx
  on public.analytics_page_views (session_id, viewed_at);
create index if not exists analytics_page_views_path_idx
  on public.analytics_page_views (path);

alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;

-- =====================================================================
-- Read-only aggregates for the admin dashboard (service_role only).
-- =====================================================================

create or replace function public.admin_analytics_summary(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'sessions',
      (select count(*)::bigint from public.analytics_sessions where started_at >= p_since),
    'unique_visitors',
      (select count(distinct visitor_id)::bigint from public.analytics_sessions where started_at >= p_since),
    'page_views',
      (select count(*)::bigint from public.analytics_page_views where viewed_at >= p_since),
    'avg_engaged_s',
      coalesce(
        (select avg(engaged_ms) / 1000.0 from public.analytics_sessions where started_at >= p_since and engaged_ms > 0),
        0
      )
  );
$$;

create or replace function public.admin_analytics_top_paths(p_since timestamptz, p_limit int)
returns table (path text, view_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select pv.path, count(*)::bigint as view_count
  from public.analytics_page_views pv
  where pv.viewed_at >= p_since
  group by pv.path
  order by count(*) desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.admin_analytics_summary(timestamptz) from public;
revoke all on function public.admin_analytics_top_paths(timestamptz, int) from public;
grant execute on function public.admin_analytics_summary(timestamptz) to service_role;
grant execute on function public.admin_analytics_top_paths(timestamptz, int) to service_role;
