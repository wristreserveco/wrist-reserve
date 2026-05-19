-- =====================================================================
-- 025_analytics_admin_extended.sql
-- Extended admin aggregates for visitor analytics dashboard.
-- Safe to re-run (create or replace).
-- =====================================================================

create or replace function public.admin_analytics_extended_summary(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select *
    from public.analytics_sessions
    where started_at >= p_since
  ),
  bounced as (
    select count(*)::bigint as n from sess where page_view_count <= 1
  ),
  returning as (
    select count(*)::bigint as n
    from (
      select visitor_id
      from sess
      group by visitor_id
      having count(*) > 1
    ) r
  )
  select jsonb_build_object(
    'sessions', (select count(*)::bigint from sess),
    'unique_visitors', (select count(distinct visitor_id)::bigint from sess),
    'page_views', (
      select count(*)::bigint
      from public.analytics_page_views pv
      where pv.viewed_at >= p_since
    ),
    'avg_engaged_s',
      coalesce(
        (select avg(engaged_ms) / 1000.0 from sess where engaged_ms > 0),
        0
      ),
    'live_sessions',
      (
        select count(*)::bigint
        from public.analytics_sessions
        where last_activity_at >= now() - interval '15 minutes'
      ),
    'returning_visitors', (select n from returning),
    'marketing_opt_ins',
      (select count(*)::bigint from sess where marketing_opt_in = true),
    'bounce_sessions', (select n from bounced),
    'product_views',
      (
        select count(*)::bigint
        from public.analytics_page_views pv
        where pv.viewed_at >= p_since
          and pv.product_id is not null
      )
  );
$$;

create or replace function public.admin_analytics_top_referrers(
  p_since timestamptz,
  p_limit int
)
returns table (source_label text, session_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when referrer is null or btrim(referrer) = '' then '(direct / none)'
      else lower(
        split_part(
          regexp_replace(
            regexp_replace(referrer, '^https?://', ''),
            '^www\.', ''
          ),
          '/',
          1
        )
      )
    end as source_label,
    count(*)::bigint as session_count
  from public.analytics_sessions
  where started_at >= p_since
  group by 1
  order by session_count desc
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.admin_analytics_top_utm(
  p_since timestamptz,
  p_limit int
)
returns table (
  utm_source text,
  utm_medium text,
  utm_campaign text,
  session_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(btrim(utm_source), ''), '(none)') as utm_source,
    coalesce(nullif(btrim(utm_medium), ''), '—') as utm_medium,
    coalesce(nullif(btrim(utm_campaign), ''), '—') as utm_campaign,
    count(*)::bigint as session_count
  from public.analytics_sessions
  where started_at >= p_since
    and (
      utm_source is not null
      or utm_medium is not null
      or utm_campaign is not null
    )
  group by 1, 2, 3
  order by session_count desc
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.admin_analytics_top_products(
  p_since timestamptz,
  p_limit int
)
returns table (
  product_id text,
  view_count bigint,
  unique_sessions bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pv.product_id,
    count(*)::bigint as view_count,
    count(distinct pv.session_id)::bigint as unique_sessions
  from public.analytics_page_views pv
  where pv.viewed_at >= p_since
    and pv.product_id is not null
    and btrim(pv.product_id) <> ''
  group by pv.product_id
  order by view_count desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.admin_analytics_extended_summary(timestamptz) from public;
revoke all on function public.admin_analytics_top_referrers(timestamptz, int) from public;
revoke all on function public.admin_analytics_top_utm(timestamptz, int) from public;
revoke all on function public.admin_analytics_top_products(timestamptz, int) from public;

grant execute on function public.admin_analytics_extended_summary(timestamptz) to service_role;
grant execute on function public.admin_analytics_top_referrers(timestamptz, int) to service_role;
grant execute on function public.admin_analytics_top_utm(timestamptz, int) to service_role;
grant execute on function public.admin_analytics_top_products(timestamptz, int) to service_role;
