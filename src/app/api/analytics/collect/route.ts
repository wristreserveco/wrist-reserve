import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function parseProductId(path: string): string | null {
  const m = /^\/products\/([^/?#]+)/.exec(path);
  return m ? m[1] : null;
}

type CollectBody = {
  visitorId?: string;
  sessionId?: string;
  type?: "session_boot" | "pageview" | "pulse";
  path?: string;
  query?: string;
  title?: string;
  referrer?: string;
  utm?: Record<string, string | undefined>;
  dwellMs?: number;
  pulseMs?: number;
  viewport?: { w?: number; h?: number };
  language?: string;
  timezone?: string;
};

/**
 * Public beacon for first-party analytics. No cookies — the browser sends
 * stable UUIDs in localStorage / sessionStorage. Writes use the service role
 * so analytics tables stay locked down in Supabase.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit({
    key: `analytics:ip:${ip}`,
    limit: 180,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: CollectBody;
  try {
    body = (await request.json()) as CollectBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isUuid(body.visitorId) || !isUuid(body.sessionId)) {
    return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
  }

  const type = body.type;
  if (type !== "session_boot" && type !== "pageview" && type !== "pulse") {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const vrl = await rateLimit({
    key: `analytics:visitor:${body.visitorId}`,
    limit: 400,
    windowSec: 60,
  });
  if (!vrl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "analytics_unconfigured" }, { status: 503 });
  }

  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  try {
    if (type === "pulse") {
      const pulseMs = Math.min(
        120_000,
        Math.max(0, Math.floor(Number(body.pulseMs) || 0))
      );
      if (pulseMs === 0) {
        return NextResponse.json({ ok: true });
      }
      const { data: row, error: findErr } = await service
        .from("analytics_sessions")
        .select("id, engaged_ms")
        .eq("session_public_id", body.sessionId)
        .maybeSingle();
      if (findErr || !row) {
        return NextResponse.json({ ok: true });
      }
      await service
        .from("analytics_sessions")
        .update({
          last_activity_at: new Date().toISOString(),
          engaged_ms: (row.engaged_ms as number) + pulseMs,
        })
        .eq("id", row.id);
      return NextResponse.json({ ok: true });
    }

    if (type === "session_boot") {
      const path = (body.path ?? "/").slice(0, 2048);
      const query = (body.query ?? "").slice(0, 2048);
      const referrer = (body.referrer ?? "").slice(0, 2048);
      const utm = body.utm ?? {};

      const { data: existing } = await service
        .from("analytics_sessions")
        .select("id")
        .eq("session_public_id", body.sessionId)
        .maybeSingle();

      if (existing) {
        await service
          .from("analytics_sessions")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", existing.id);
        return NextResponse.json({ ok: true });
      }

      const { error } = await service.from("analytics_sessions").insert({
        session_public_id: body.sessionId,
        visitor_id: body.visitorId,
        landing_path: path,
        landing_query: query || null,
        referrer: referrer || null,
        utm_source: utm.utm_source?.slice(0, 256) ?? null,
        utm_medium: utm.utm_medium?.slice(0, 256) ?? null,
        utm_campaign: utm.utm_campaign?.slice(0, 256) ?? null,
        utm_content: utm.utm_content?.slice(0, 256) ?? null,
        utm_term: utm.utm_term?.slice(0, 256) ?? null,
        user_agent: ua,
        client_ip: ip.slice(0, 64),
        viewport_w: body.viewport?.w != null ? Math.floor(body.viewport.w) : null,
        viewport_h: body.viewport?.h != null ? Math.floor(body.viewport.h) : null,
        browser_language: body.language?.slice(0, 64) ?? null,
        timezone: body.timezone?.slice(0, 128) ?? null,
      });

      if (error) {
        if (/relation|does not exist/i.test(error.message)) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        console.error("[analytics/collect] session_boot", error);
        return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // pageview
    const path = (body.path ?? "/").slice(0, 2048);
    const query = (body.query ?? "").slice(0, 2048);
    const title = (body.title ?? "").slice(0, 512);
    const dwellMs = Math.min(
      3_600_000,
      Math.max(0, Math.floor(Number(body.dwellMs) || 0))
    );

    const findRes = await service
      .from("analytics_sessions")
      .select("id, page_view_count, engaged_ms")
      .eq("session_public_id", body.sessionId)
      .maybeSingle();

    if (findRes.error) {
      console.error("[analytics/collect] find session", findRes.error);
      return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
    }

    let session = findRes.data as {
      id: string;
      page_view_count: number;
      engaged_ms: number;
    } | null;

    if (!session) {
      const referrer = (body.referrer ?? "").slice(0, 2048);
      const utm = body.utm ?? {};
      const ins = await service
        .from("analytics_sessions")
        .insert({
          session_public_id: body.sessionId,
          visitor_id: body.visitorId,
          landing_path: path,
          landing_query: query || null,
          referrer: referrer || null,
          utm_source: utm.utm_source?.slice(0, 256) ?? null,
          utm_medium: utm.utm_medium?.slice(0, 256) ?? null,
          utm_campaign: utm.utm_campaign?.slice(0, 256) ?? null,
          utm_content: utm.utm_content?.slice(0, 256) ?? null,
          utm_term: utm.utm_term?.slice(0, 256) ?? null,
          user_agent: ua,
          client_ip: ip.slice(0, 64),
          viewport_w: body.viewport?.w != null ? Math.floor(body.viewport.w) : null,
          viewport_h: body.viewport?.h != null ? Math.floor(body.viewport.h) : null,
          browser_language: body.language?.slice(0, 64) ?? null,
          timezone: body.timezone?.slice(0, 128) ?? null,
        })
        .select("id, page_view_count, engaged_ms")
        .single();
      if (ins.error || !ins.data) {
        if (ins.error && /relation|does not exist/i.test(ins.error.message)) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        console.error("[analytics/collect] insert session", ins.error);
        return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
      }
      session = ins.data as { id: string; page_view_count: number; engaged_ms: number };
    }

    const sid = session.id as string;

    if (dwellMs > 0) {
      const { data: lastPv } = await service
        .from("analytics_page_views")
        .select("id, dwell_ms")
        .eq("session_id", sid)
        .order("viewed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastPv && (lastPv.dwell_ms == null || lastPv.dwell_ms === 0)) {
        await service
          .from("analytics_page_views")
          .update({ dwell_ms: dwellMs })
          .eq("id", lastPv.id);
      }
      await service
        .from("analytics_sessions")
        .update({
          engaged_ms: (session.engaged_ms as number) + dwellMs,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", sid);
    }

    const productId = parseProductId(path);

    const pvIns = await service.from("analytics_page_views").insert({
      session_id: sid,
      path,
      query_string: query || null,
      title: title || null,
      product_id: productId,
    });
    if (pvIns.error) {
      console.error("[analytics/collect] pageview insert", pvIns.error);
      return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
    }

    await service
      .from("analytics_sessions")
      .update({
        last_activity_at: new Date().toISOString(),
        exit_path: path,
        page_view_count: (session.page_view_count as number) + 1,
      })
      .eq("id", sid);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[analytics/collect]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
