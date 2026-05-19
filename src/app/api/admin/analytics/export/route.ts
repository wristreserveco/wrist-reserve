import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
      "session_public_id, visitor_id, started_at, last_activity_at, landing_path, exit_path, referrer, utm_source, utm_medium, utm_campaign, page_view_count, engaged_ms, capture_email, capture_name, marketing_opt_in, admin_notes, admin_tags, client_ip, user_agent"
    )
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "session_id",
    "visitor_id",
    "started_at",
    "last_activity_at",
    "landing_path",
    "exit_path",
    "referrer",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "page_views",
    "engaged_seconds",
    "capture_email",
    "capture_name",
    "marketing_opt_in",
    "admin_notes",
    "admin_tags",
    "client_ip",
    "user_agent",
  ];

  const lines = [header.join(",")];
  for (const r of rows ?? []) {
    const engagedS = ((r.engaged_ms as number) ?? 0) / 1000;
    const tags = Array.isArray(r.admin_tags) ? (r.admin_tags as string[]).join("|") : "";
    lines.push(
      [
        r.session_public_id,
        r.visitor_id,
        r.started_at,
        r.last_activity_at,
        r.landing_path,
        r.exit_path,
        r.referrer,
        r.utm_source,
        r.utm_medium,
        r.utm_campaign,
        String(r.page_view_count ?? 0),
        String(Math.round(engagedS * 10) / 10),
        r.capture_email,
        r.capture_name,
        r.marketing_opt_in ? "yes" : "no",
        r.admin_notes,
        tags,
        r.client_ip,
        r.user_agent,
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
      "Content-Disposition": `attachment; filename="wrist-reserve-analytics-${days}d.csv"`,
    },
  });
}
