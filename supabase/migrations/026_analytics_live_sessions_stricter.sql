-- Tighten "browsing now" count: ignore single-page bounces (re-run safe).
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
  repeat_visitors as (
    select count(*)::bigint as n
    from (
      select visitor_id
      from sess
      group by visitor_id
      having count(*) > 1
    ) r
  )
  select jsonb_build_object(
    'sessions',
      (select count(*)::bigint from sess),
    'unique_visitors',
      (select count(distinct visitor_id)::bigint from sess),
    'page_views',
      (
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
          and (page_view_count >= 2 or engaged_ms >= 20000)
      ),
    'returning_visitors', (select n from repeat_visitors),
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

grant execute on function public.admin_analytics_extended_summary(timestamptz) to service_role;
