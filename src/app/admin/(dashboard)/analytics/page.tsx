import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AnalyticsSessionShell } from "@/components/admin/AnalyticsSessionShell";

export const dynamic = "force-dynamic";

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

type AnalyticsSummary = {
  sessions: number;
  unique_visitors: number;
  page_views: number;
  avg_engaged_s: number;
};

type SessionListRow = {
  id: string;
  session_public_id: string;
  visitor_id: string;
  started_at: string;
  last_activity_at: string;
  landing_path: string | null;
  exit_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_view_count: number;
  engaged_ms: number;
  capture_email: string | null;
  marketing_opt_in: boolean | null;
};

type TopPathRow = { path: string; view_count: number };

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

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  let warning: string | null = null;
  let summary: AnalyticsSummary | null = null;
  let topPaths: TopPathRow[] = [];
  let sessions: SessionListRow[] = [];
  let bouncePct: number | null = null;
  let avgPagesPerSession: number | null = null;

  try {
    const service = createServiceClient();

    const sumRes = await service.rpc("admin_analytics_summary", {
      p_since: sinceIso,
    });
    if (sumRes.error) {
      if (/function|does not exist|schema cache/i.test(sumRes.error.message)) {
        warning =
          "Analytics tables or SQL functions not installed yet. Run supabase/migrations/024_site_analytics.sql in the Supabase SQL editor.";
      } else {
        warning = sumRes.error.message;
      }
    } else {
      summary = (sumRes.data ?? null) as AnalyticsSummary | null;
    }

    if (!warning) {
      const tpRes = await service.rpc("admin_analytics_top_paths", {
        p_since: sinceIso,
        p_limit: 20,
      });
      if (!tpRes.error && Array.isArray(tpRes.data)) {
        topPaths = tpRes.data as TopPathRow[];
      }

      const { data: sRows, error: sErr } = await service
        .from("analytics_sessions")
        .select(
          "id, session_public_id, visitor_id, started_at, last_activity_at, landing_path, exit_path, referrer, utm_source, utm_medium, utm_campaign, page_view_count, engaged_ms, capture_email, marketing_opt_in"
        )
        .gte("started_at", sinceIso)
        .order("last_activity_at", { ascending: false })
        .limit(250);

      if (sErr) {
        warning = sErr.message;
      } else {
        sessions = (sRows ?? []) as SessionListRow[];
      }

      if (!warning && summary && summary.sessions > 0) {
        avgPagesPerSession =
          Number(summary.page_views ?? 0) / Number(summary.sessions);
      }

      if (!warning) {
        const [totalSessionsRes, bounceSessionsRes] = await Promise.all([
          service
            .from("analytics_sessions")
            .select("id", { count: "exact", head: true })
            .gte("started_at", sinceIso),
          service
            .from("analytics_sessions")
            .select("id", { count: "exact", head: true })
            .gte("started_at", sinceIso)
            .lte("page_view_count", 1),
        ]);
        const tot = totalSessionsRes.count ?? 0;
        const bounced = bounceSessionsRes.count ?? 0;
        if (tot > 0) bouncePct = (bounced / tot) * 100;
      }
    }
  } catch (e) {
    warning =
      e instanceof Error
        ? e.message
        : "Could not connect to analytics (check SUPABASE_SERVICE_ROLE_KEY).";
  }

  const qBase = (d: number) =>
    sessionOpen
      ? `/admin/analytics?days=${d}&session=${encodeURIComponent(sessionOpen)}`
      : `/admin/analytics?days=${d}`;

  return (
    <div className="space-y-8">
      <AnalyticsSessionShell />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
            Traffic
          </p>
          <h1 className="font-display text-3xl text-white">Visitor analytics</h1>
          <p className="mt-1 max-w-2xl text-xs text-white/45">
            First-party traffic: landing + exit URLs, referrer and UTM, full page
            sequence with dwell time and active-tab pulses, CRM notes/tags, and CSV
            export. Only store marketing contacts you are legally allowed to use.
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
        {[1, 7, 14, 30].map((d) => (
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

      {warning ? (
        <div className="rounded-sm border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-200">
          {warning}
        </div>
      ) : (
        <div className="rounded-sm border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 text-xs text-sky-100/90">
          <p className="font-medium text-sky-50/95">Where this data lives</p>
          <p className="mt-1 text-sky-100/75">
            Events are written to your Supabase project (no third-party analytics
            script). Use <span className="font-mono text-[11px]">/admin/analytics</span>{" "}
            or the sidebar{" "}
            <span className="font-semibold text-white/90">Visitor analytics</span>{" "}
            tab — same place as the dashboard promo card.
          </p>
        </div>
      )}

      {!warning && summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { k: "Sessions", v: String(summary.sessions ?? 0) },
            { k: "Unique visitors", v: String(summary.unique_visitors ?? 0) },
            { k: "Page views", v: String(summary.page_views ?? 0) },
            {
              k: "Avg engaged / session",
              v: `${(Number(summary.avg_engaged_s) || 0).toFixed(1)}s`,
            },
            {
              k: "Avg pages / session",
              v:
                avgPagesPerSession != null
                  ? avgPagesPerSession.toFixed(2)
                  : "—",
            },
            {
              k: "Bounce rate (1 page)",
              v:
                bouncePct != null
                  ? `${bouncePct.toFixed(1)}%`
                  : "—",
            },
          ].map((c) => (
            <div
              key={c.k}
              className="rounded-sm border border-white/10 bg-black/40 px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                {c.k}
              </p>
              <p className="mt-1 font-display text-2xl text-white">{c.v}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!warning && topPaths.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-white/55">
            Top pages
          </h2>
          <ul className="mt-3 divide-y divide-white/10 rounded-sm border border-white/10">
            {topPaths.map((row) => (
              <li
                key={row.path}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <span className="truncate font-mono text-white/80">{row.path}</span>
                <span className="shrink-0 tabular-nums text-gold-200/90">
                  {row.view_count} views
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!warning ? (
        <div>
          <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-white/55">
            Recent sessions
          </h2>
          <div className="mt-3 overflow-x-auto rounded-sm border border-white/10">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-white/40">
                  <th className="px-3 py-2">Last active</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Visitor</th>
                  <th className="px-3 py-2">Views</th>
                  <th className="px-3 py-2">Engaged</th>
                  <th className="px-3 py-2">Landing</th>
                  <th className="px-3 py-2">Exit</th>
                  <th className="px-3 py-2">UTM</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-white/45">
                      No sessions in this window yet. Browse the storefront in another
                      tab to generate data.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-3 py-2 text-white/70">
                        {new Date(s.last_activity_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-white/60">
                        {formatMs(
                          Math.max(
                            0,
                            new Date(s.last_activity_at).getTime() -
                              new Date(s.started_at).getTime()
                          )
                        )}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[10px] text-white/55">
                        {s.visitor_id.slice(0, 13)}…
                      </td>
                      <td className="px-3 py-2 tabular-nums text-white/80">
                        {s.page_view_count}
                      </td>
                      <td className="px-3 py-2 text-white/70">{formatMs(s.engaged_ms)}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-white/70">
                        {s.landing_path ?? "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-white/55">
                        {s.exit_path ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-white/50">
                        {[s.utm_source, s.utm_medium].filter(Boolean).join("/") || "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-white/60">
                        {s.capture_email ?? "—"}
                        {s.marketing_opt_in ? (
                          <span className="ml-1 text-gold-300/90">· opt-in</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link
                          href={`/admin/analytics?days=${days}&session=${encodeURIComponent(s.session_public_id)}`}
                          className="text-[10px] uppercase tracking-[0.18em] text-gold-200/90 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-100"
                        >
                          Journey + CRM
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
