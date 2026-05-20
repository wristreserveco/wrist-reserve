import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMarketingInsights, type SessionMarketingRow } from "@/lib/analytics/marketing";

export const runtime = "nodejs";

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = new Date();
  since.setDate(since.getDate() - days);

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await service
    .from("analytics_sessions")
    .select(
      "session_public_id, visitor_id, started_at, last_activity_at, landing_path, exit_path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_view_count, engaged_ms, capture_email, capture_name, marketing_opt_in"
    )
    .gte("started_at", since.toISOString())
    .order("engaged_ms", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (rows ?? []) as SessionMarketingRow[];
  const insights = buildMarketingInsights(sessions);

  const hotIds = new Set(insights.hotLeads.map((h) => h.sessionPublicId));
  const exportRows = sessions.filter(
    (s) =>
      hotIds.has(s.session_public_id) ||
      (s.marketing_opt_in && s.capture_email?.trim())
  );

  const header = [
    "email",
    "name",
    "segment",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "engaged_seconds",
    "page_views",
    "landing_path",
    "session_id",
    "started_at",
  ];

  const lines = [header.join(",")];
  for (const r of exportRows) {
    const segment = hotIds.has(r.session_public_id)
      ? r.marketing_opt_in
        ? "hot_lead_opt_in"
        : "hot_lead"
      : "marketing_opt_in";
    lines.push(
      [
        r.capture_email,
        r.capture_name,
        segment,
        r.utm_source,
        r.utm_medium,
        r.utm_campaign,
        String(Math.round((r.engaged_ms ?? 0) / 1000)),
        String(r.page_view_count ?? 0),
        r.landing_path,
        r.session_public_id,
        r.started_at,
      ]
        .map((c) => csvEscape(c == null ? "" : String(c)))
        .join(",")
    );
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wrist-reserve-audiences-${days}d.csv"`,
    },
  });
}
