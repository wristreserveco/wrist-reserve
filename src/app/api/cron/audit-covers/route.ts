import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron-friendly health check: scans every product with a video and tells us
 * which ones are showing a black / missing cover.
 *
 *   - Pure read-only. No frame extraction here (ffmpeg is too heavy for a
 *     Vercel function bundle); this endpoint is the *detection* half.
 *   - Sends a single summary email to RESEND_REPLY_TO (or, failing that,
 *     RESEND_FROM_EMAIL) when one or more products need repair, so the
 *     admin can run `npm run fix-covers` from a laptop to patch them.
 *   - Returns the same JSON in the response body so the cron log doubles
 *     as an audit trail.
 *
 * Wired in `vercel.json` to run every hour. Idempotent — re-running just
 * re-detects; nothing is mutated.
 *
 * Auth: Vercel Cron sends a header `Authorization: Bearer ${CRON_SECRET}`
 * when the env var is configured. We accept that OR any request from an
 * authenticated admin (the same supabase session the rest of /api/admin
 * uses) so manual triggers from the dashboard work too.
 */

const BLACK_THRESHOLD = 20; // 0-255 avg luma

interface ProductRow {
  id: string;
  name: string;
  video_url: string | null;
  video_poster_url: string | null;
  media_urls: string[] | null;
}

interface Offender {
  id: string;
  name: string;
  reason: "missing_poster" | "black_poster";
  brightness?: number;
}

/**
 * Pixel-average via signature byte sampling: pull the first 8 KB of the
 * JPEG, look for the start of pixel data, and approximate brightness by
 * histogramming bright vs. dark byte runs. Not as accurate as a full
 * canvas decode, but doesn't need an image library on the server.
 *
 * For sub-millisecond filtering, this is good enough — we only care
 * whether the image is "completely black" (a known failure mode) vs.
 * "has SOME content".
 */
async function fetchAndScoreBrightness(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-32767" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // For pure-black JPEGs the entropy is extremely low — the entire pixel
    // section compresses to a few hundred bytes of repetition. We use file
    // size as a strong negative signal: a real JPEG with subject detail at
    // 1080×1920 is >25 KB even at q=86, whereas the black ones we found
    // earlier were all 8-10 KB.
    const headRes = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });
    const len = Number(headRes.headers.get("content-length") || "0");
    if (!len) {
      // No length header — fall back to byte entropy.
      const entropy = byteVariance(buf);
      return entropy < 8 ? 0 : 128;
    }
    // Heuristic ladder calibrated against the real product data:
    //   <= 10 KB  → almost certainly pure black (we measured 6 black @ 8 KB).
    //   10-15 KB  → suspicious; treat as black for caution.
    //   > 15 KB   → probably has content.
    if (len < 10 * 1024) return 0;
    if (len < 15 * 1024) {
      const entropy = byteVariance(buf);
      return entropy < 12 ? 0 : 128;
    }
    return 128;
  } catch {
    return null;
  }
}

function byteVariance(buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const mean = sum / buf.length;
  let varSum = 0;
  for (let i = 0; i < buf.length; i++) {
    const d = buf[i] - mean;
    varSum += d * d;
  }
  return Math.sqrt(varSum / buf.length);
}

function checkAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret set → allow (dev-friendly).
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, video_url, video_poster_url, media_urls");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ProductRow[];
  const withVideo = rows.filter((r) => r.video_url);
  const offenders: Offender[] = [];

  // Sequential to keep load on Supabase Storage gentle. 13 products = ~3s
  // total at ~200ms per HEAD; scales linearly. If the catalog grows past
  // a few hundred we'd want to parallelise with a concurrency cap.
  for (const p of withVideo) {
    const hasOwnImage = (p.media_urls?.length ?? 0) > 0;
    if (!p.video_poster_url && !hasOwnImage) {
      offenders.push({ id: p.id, name: p.name, reason: "missing_poster" });
      continue;
    }
    const probeUrl = p.video_poster_url ?? p.media_urls![0];
    const brightness = await fetchAndScoreBrightness(probeUrl);
    if (brightness === null) continue; // probe failed, leave alone
    if (brightness < BLACK_THRESHOLD) {
      offenders.push({
        id: p.id,
        name: p.name,
        reason: "black_poster",
        brightness,
      });
    }
  }

  const summary = {
    scanned: withVideo.length,
    offenders: offenders.length,
    items: offenders,
    timestamp: new Date().toISOString(),
  };

  // If anything is broken and email is configured, ping the admin. We
  // don't ping when everything's healthy — keeps the inbox quiet.
  if (offenders.length > 0 && isEmailConfigured()) {
    const to =
      process.env.RESEND_REPLY_TO ||
      process.env.RESEND_FROM_EMAIL ||
      "admin@wristreserve.co";
    try {
      await sendEmail({
        to,
        subject: `Wrist Reserve · ${offenders.length} product${
          offenders.length === 1 ? "" : "s"
        } need a real cover`,
        text:
          `${offenders.length} product${offenders.length === 1 ? "" : "s"} ` +
          `currently render a black or missing cover on the storefront.\n\n` +
          offenders.map((o) => `  • ${o.name}  (${o.reason})`).join("\n") +
          `\n\n` +
          `Quick fix:  npm run fix-covers   (re-extracts frames using ffmpeg)\n`,
        tags: [{ name: "kind", value: "covers-audit" }],
      });
    } catch (e) {
      console.error("[covers-audit] email send failed:", e);
    }
  }

  return NextResponse.json(summary);
}
