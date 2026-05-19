import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ visitorId: string }> }
) {
  const { visitorId } = await context.params;
  const id = decodeURIComponent(visitorId || "").trim();
  if (!id || id.length > 128) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: sessions, error } = await service
    .from("analytics_sessions")
    .select(
      "session_public_id, started_at, last_activity_at, page_view_count, landing_path, exit_path, referrer, utm_source, engaged_ms, capture_email"
    )
    .eq("visitor_id", id)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ visitorId: id, sessions: sessions ?? [] });
}
