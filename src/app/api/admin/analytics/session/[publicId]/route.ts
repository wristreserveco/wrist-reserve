import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const id = decodeURIComponent(publicId || "").trim();
  if (!id) {
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

  const { data: session, error: sErr } = await service
    .from("analytics_sessions")
    .select("*")
    .eq("session_public_id", id)
    .maybeSingle();

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: views, error: vErr } = await service
    .from("analytics_page_views")
    .select("id, path, query_string, title, product_id, viewed_at, dwell_ms")
    .eq("session_id", session.id as string)
    .order("viewed_at", { ascending: true });

  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  return NextResponse.json({ session, views: views ?? [] });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const id = decodeURIComponent(publicId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    admin_notes?: string | null;
    admin_tags?: string[] | null;
    capture_email?: string | null;
    capture_name?: string | null;
    marketing_opt_in?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const patch: Record<string, unknown> = {};
  if ("admin_notes" in body) {
    patch.admin_notes = body.admin_notes?.slice(0, 8000) ?? null;
  }
  if ("admin_tags" in body && Array.isArray(body.admin_tags)) {
    patch.admin_tags = body.admin_tags
      .map((t) => String(t).trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 32);
  }
  if ("capture_email" in body) {
    const e = body.capture_email?.trim().slice(0, 320);
    patch.capture_email = e || null;
  }
  if ("capture_name" in body) {
    patch.capture_name = body.capture_name?.trim().slice(0, 200) || null;
  }
  if ("marketing_opt_in" in body) {
    patch.marketing_opt_in = Boolean(body.marketing_opt_in);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 });
  }

  const { data, error } = await service
    .from("analytics_sessions")
    .update(patch)
    .eq("session_public_id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ session: data });
}
