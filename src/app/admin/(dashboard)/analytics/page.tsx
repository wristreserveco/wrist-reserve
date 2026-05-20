import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AnalyticsSessionShell } from "@/components/admin/AnalyticsSessionShell";
import { AdminAnalyticsBreakdowns } from "@/components/admin/AdminAnalyticsBreakdowns";
import { AdminAnalyticsSearch } from "@/components/admin/AdminAnalyticsSearch";
import { AdminMarketingHub } from "@/components/admin/AdminMarketingHub";
import { buildMarketingInsights } from "@/lib/analytics/marketing";
import {
  formatMs,
  isLiveSession,
  parseUserAgent,
  pathWithQuery,
  referrerLabel,
} from "@/lib/analytics/display";

export const dynamic = "force-dynamic";

type ExtendedSummary = {
  sessions: number;
  unique_visitors: number;
  page_views: number;
  avg_engaged_s: number;
  live_sessions: number;
  returning_visitors: number;
  marketing_opt_ins: number;
  bounce_sessions: number;
  product_views: number;
};

type SessionListRow = {
  id: string;
  session_public_id: string;
  visitor_id: string;
  started_at: string;
  last_activity_at: string;
  landing_path: string | null;
  landing_query: string | null;
  exit_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  page_view_count: number;
  engaged_ms: number;
  capture_email: string | null;
  capture_name: string | null;
  marketing_opt_in: boolean | null;
  admin_tags: string[] | null;
  user_agent: string | null;
  client_ip: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  browser_language: string | null;
  timezone: string | null;
};

const SESSION_SELECT =
  "id, session_public_id, visitor_id, started_at, last_activity_at, landing_path, landing_query, exit_path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_view_count, engaged_ms, capture_email, capture_name, marketing_opt_in, admin_tags, user_agent, client_ip, viewport_w, viewport_h, browser_language, timezone";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const rawDays = searchParams.days;
  const daysStr = Array.isArray(rawDays) ? rawDays[0] : rawDays;
  const days = Math.min(90, Math.max(1, Number(daysStr) || 7));
  const sessionOpen =
    typeof searchParams.session === "string" ? searchParams.session : "";
  const searchQ =
    typeof searchParams.q === "string"
      ? searchParams.q.trim().replace(/[%_\\]/g, "").slice(0, 120)
      : "";

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  let warning: string | null = null;
  let needsMigration025 = false;
  let summary: ExtendedSummary | null = null;
  let topPaths: { path: string; view_count: number }[] = [];
  let topReferrers: { source_label: string; session_count: number }[] = [];
  let topProducts: {
    product_id: string;
    view_count: number;
    unique_sessions: number;
  }[] = [];
  let sessions: SessionListRow[] = [];

  try {
    const service = createServiceClient();

    const extRes = await service.rpc("admin_analytics_extended_summary", {
      p_since: sinceIso,
    });

    if (extRes.error) {
      if (/function|does not exist|schema cache/i.test(extRes.error.message)) {
        needsMigration025 = true;
        const sumRes = await service.rpc("admin_analytics_summary", {
          p_since: sinceIso,
        });
        if (sumRes.error) {
          if (/function|does not exist|schema cache/i.test(sumRes.error.message)) {
            warning =
              "Analytics not installed. Run supabase/migrations/024_site_analytics.sql then 025_analytics_admin_extended.sql in Supabase SQL editor.";
          } else {
            warning = sumRes.error.message;
          }
        } else {
          const basic = sumRes.data as Record<string, number> | null;
          summary = {
            sessions: Number(basic?.sessions ?? 0),
            unique_visitors: Number(basic?.unique_visitors ?? 0),
            page_views: Number(basic?.page_views ?? 0),
            avg_engaged_s: Number(basic?.avg_engaged_s ?? 0),
            live_sessions: 0,
            returning_visitors: 0,
            marketing_opt_ins: 0,
            bounce_sessions: 0,
            product_views: 0,
          };
        }
      } else {
        warning = extRes.error.message;
      }
    } else {
      summary = extRes.data as ExtendedSummary;
    }

    if (!warning) {
      const [tpRes, refRes, prodRes] = await Promise.all([
        service.rpc("admin_analytics_top_paths", { p_since: sinceIso, p_limit: 25 }),
        needsMigration025
          ? Promise.resolve({ data: [], error: null })
          : service.rpc("admin_analytics_top_referrers", {
              p_since: sinceIso,
              p_limit: 15,
            }),
        needsMigration025
          ? Promise.resolve({ data: [], error: null })
          : service.rpc("admin_analytics_top_products", {
              p_since: sinceIso,
              p_limit: 15,
            }),
      ]);

      if (!tpRes.error && Array.isArray(tpRes.data)) {
        topPaths = tpRes.data as typeof topPaths;
      }
      if (!refRes.error && Array.isArray(refRes.data)) {
        topReferrers = refRes.data as typeof topReferrers;
      }
      if (!prodRes.error && Array.isArray(prodRes.data)) {
        topProducts = prodRes.data as typeof topProducts;
      }

      let sessionQuery = service
        .from("analytics_sessions")
        .select(SESSION_SELECT)
        .gte("started_at", sinceIso)
        .order("last_activity_at", { ascending: false })
        .limit(500);

      if (searchQ) {
        sessionQuery = sessionQuery.or(
          [
            `capture_email.ilike.%${searchQ}%`,
            `capture_name.ilike.%${searchQ}%`,
            `referrer.ilike.%${searchQ}%`,
            `visitor_id.ilike.%${searchQ}%`,
            `landing_path.ilike.%${searchQ}%`,
            `exit_path.ilike.%${searchQ}%`,
            `utm_source.ilike.%${searchQ}%`,
            `utm_medium.ilike.%${searchQ}%`,
            `utm_campaign.ilike.%${searchQ}%`,
            `client_ip.ilike.%${searchQ}%`,
          ].join(",")
        );
      }

      const { data: sRows, error: sErr } = await sessionQuery;

      if (sErr) {
        warning = sErr.message;
      } else {
        sessions = (sRows ?? []) as SessionListRow[];
      }

      if (summary && needsMigration025) {
        const liveSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const [liveRes, bounceRes, optInRes, prodViewsRes] = await Promise.all([
          service
            .from("analytics_sessions")
            .select("id", { count: "exact", head: true })
            .gte("last_activity_at", liveSince)
            .or("page_view_count.gte.2,engaged_ms.gte.20000"),
          service
            .from("analytics_sessions")
            .select("id", { count: "exact", head: true })
            .gte("started_at", sinceIso)
            .lte("page_view_count", 1),
          service
            .from("analytics_sessions")
            .select("id", { count: "exact", head: true })
            .gte("started_at", sinceIso)
            .eq("marketing_opt_in", true),
          service
            .from("analytics_page_views")
            .select("id", { count: "exact", head: true })
            .gte("viewed_at", sinceIso)
            .not("product_id", "is", null),
        ]);
        summary.live_sessions = liveRes.count ?? 0;
        summary.bounce_sessions = bounceRes.count ?? 0;
        summary.marketing_opt_ins = optInRes.count ?? 0;
        summary.product_views = prodViewsRes.count ?? 0;
      }
    }
  } catch (e) {
    warning =
      e instanceof Error
        ? e.message
        : "Could not connect to analytics (check SUPABASE_SERVICE_ROLE_KEY).";
  }

  const bouncePct =
    summary && summary.sessions > 0
      ? (summary.bounce_sessions / summary.sessions) * 100
      : null;
  const avgPagesPerSession =
    summary && summary.sessions > 0
      ? summary.page_views / summary.sessions
      : null;

  const qBase = (d: number) => {
    const p = new URLSearchParams();
    p.set("days", String(d));
    if (sessionOpen) p.set("session", sessionOpen);
    if (searchQ) p.set("q", searchQ);
    return `/admin/analytics?${p.toString()}`;
  };

  const sessionLink = (publicId: string) => {
    const p = new URLSearchParams();
    p.set("days", String(days));
    p.set("session", publicId);
    if (searchQ) p.set("q", searchQ);
    return `/admin/analytics?${p.toString()}`;
  };

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.wristreserve.co";
  const marketingInsights = !warning
    ? buildMarketingInsights(sessions)
    : null;

  return (
    <div className="space-y-8">
      <AnalyticsSessionShell />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
            Traffic
          </p>
          <h1 className="font-display text-3xl text-white">Visitor analytics</h1>
          <p className="mt-1 max-w-2xl text-xs text-white/45">
            Raw traffic plus a marketing playbook: tag your links, see which campaigns
            work, export hot leads, and follow up before they go cold.
          </p>
        </div>
        <a
          href={`/api/admin/analytics/export?days=${days}`}
          className="inline-flex w-fit items-center justify-center rounded-sm border border-gold-400/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-200 transition hover:border-gold-300 hover:bg-gold-400/10"
        >
          Export CSV →
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 7, 14, 30, 90].map((d) => (
          <Link
            key={d}
            href={qBase(d)}
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
              days === d
                ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
            }`}
          >
            {d}d
          </Link>
        ))}
      </div>

      <Suspense fallback={null}>
        <AdminAnalyticsSearch days={days} />
      </Suspense>

      {!warning && marketingInsights ? (
        <AdminMarketingHub
          insights={marketingInsights}
          siteUrl={siteUrl}
          days={days}
        />
      ) : null}

      {warning ? (
        <div className="rounded-sm border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-200">
          {warning}
        </div>
      ) : needsMigration025 ? (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
          Run{" "}
          <span className="font-mono">025_analytics_admin_extended.sql</span> in
          Supabase for live-visitor counts, referrer/UTM/product breakdowns, and richer
          summary cards.
        </div>
      ) : null}

      {!warning && summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              k: "Browsing now (15m)",
              v: String(summary.live_sessions ?? 0),
              hint: "2+ pages or 20s+ engaged — not sales",
            },
            { k: "Sessions", v: String(summary.sessions ?? 0) },
            { k: "Unique visitors", v: String(summary.unique_visitors ?? 0) },
            { k: "Returning visitors", v: String(summary.returning_visitors ?? 0) },
            { k: "Page views", v: String(summary.page_views ?? 0) },
            { k: "Product page views", v: String(summary.product_views ?? 0) },
            {
              k: "Avg engaged / session",
              v: `${(Number(summary.avg_engaged_s) || 0).toFixed(1)}s`,
            },
            {
              k: "Avg pages / session",
              v: avgPagesPerSession != null ? avgPagesPerSession.toFixed(2) : "—",
            },
            {
              k: "Bounce (1 page)",
              v: bouncePct != null ? `${bouncePct.toFixed(1)}%` : "—",
            },
            { k: "Marketing opt-ins", v: String(summary.marketing_opt_ins ?? 0) },
          ].map((c) => (
            <div
              key={c.k}
              className="rounded-sm border border-white/10 bg-black/40 px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                {c.k}
              </p>
              <p className="mt-1 font-display text-2xl text-white">{c.v}</p>
              {"hint" in c && c.hint ? (
                <p className="mt-1 text-[10px] text-white/35">{c.hint}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!warning ? (
        <AdminAnalyticsBreakdowns
          topPaths={topPaths}
          topReferrers={topReferrers}
          topProducts={topProducts}
        />
      ) : null}

      {!warning ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-white/55">
              Sessions
              {searchQ ? (
                <span className="ml-2 font-normal normal-case text-white/40">
                  matching &ldquo;{searchQ}&rdquo;
                </span>
              ) : null}
            </h2>
            <p className="text-[10px] text-white/35">
              Showing {sessions.length}
              {sessions.length >= 500 ? "+" : ""} · newest activity first
            </p>
          </div>
          <div className="mt-3 overflow-x-auto rounded-sm border border-white/10">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-white/40">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Started</th>
                  <th className="px-2 py-2">Last active</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Device</th>
                  <th className="px-2 py-2">Views</th>
                  <th className="px-2 py-2">Engaged</th>
                  <th className="px-2 py-2">Landing</th>
                  <th className="px-2 py-2">Exit</th>
                  <th className="px-2 py-2">UTM</th>
                  <th className="px-2 py-2">Contact / tags</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-white/45">
                      No sessions in this window
                      {searchQ ? " for that search" : ""}. Browse the storefront to
                      generate data.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => {
                    const ua = parseUserAgent(s.user_agent);
                    const live = isLiveSession(s.last_activity_at, {
                      pageViews: s.page_view_count,
                      engagedMs: s.engaged_ms,
                    });
                    const tags = Array.isArray(s.admin_tags) ? s.admin_tags : [];
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-white/5 hover:bg-white/[0.02]"
                      >
                        <td className="whitespace-nowrap px-2 py-2">
                          {live ? (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-sky-300/90">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                              Active
                            </span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-white/55">
                          {new Date(s.started_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-white/70">
                          {new Date(s.last_activity_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-white/60">
                          {formatMs(
                            Math.max(
                              0,
                              new Date(s.last_activity_at).getTime() -
                                new Date(s.started_at).getTime()
                            )
                          )}
                        </td>
                        <td
                          className="max-w-[100px] truncate px-2 py-2 text-white/65"
                          title={s.referrer ?? undefined}
                        >
                          {referrerLabel(s.referrer)}
                        </td>
                        <td className="max-w-[120px] truncate px-2 py-2 text-white/50">
                          {ua.browser}
                          <span className="text-white/30"> · </span>
                          {ua.os}
                          {s.viewport_w && s.viewport_h ? (
                            <span className="block text-[10px] text-white/35">
                              {s.viewport_w}×{s.viewport_h}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-white/80">
                          {s.page_view_count}
                        </td>
                        <td className="px-2 py-2 text-white/70">
                          {formatMs(s.engaged_ms)}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-2 py-2 font-mono text-[10px] text-white/70"
                          title={pathWithQuery(s.landing_path, s.landing_query)}
                        >
                          {pathWithQuery(s.landing_path, s.landing_query)}
                        </td>
                        <td className="max-w-[120px] truncate px-2 py-2 font-mono text-[10px] text-white/55">
                          {s.exit_path ?? "—"}
                        </td>
                        <td className="max-w-[120px] truncate px-2 py-2 text-white/50">
                          {[s.utm_source, s.utm_medium, s.utm_campaign]
                            .filter(Boolean)
                            .join(" / ") || "—"}
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2 text-white/60">
                          {s.capture_email ?? s.capture_name ?? "—"}
                          {tags.length > 0 ? (
                            <span className="mt-0.5 block text-[10px] text-gold-300/80">
                              {tags.slice(0, 2).join(", ")}
                              {tags.length > 2 ? "…" : ""}
                            </span>
                          ) : null}
                          {s.marketing_opt_in ? (
                            <span className="text-gold-300/90"> · opt-in</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <Link
                            href={sessionLink(s.session_public_id)}
                            className="text-[10px] uppercase tracking-[0.16em] text-gold-200/90 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-100"
                          >
                            Full journey →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
