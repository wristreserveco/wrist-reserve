"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  pickBestFrame,
  probeRemoteImageBrightness,
} from "@/lib/media/extract-frame";

interface ProductRow {
  id: string;
  name: string;
  video_url: string | null;
  video_poster_url: string | null;
  media_urls: string[];
  /** Reason the row landed in the backfill queue (debug + UI hint). */
  reason: "no_cover" | "black_cover" | "low_quality";
  /** Avg brightness of the existing poster, when we could probe it. */
  existingBrightness?: number | null;
}

type Status = "pending" | "working" | "done" | "skipped" | "error";

interface Job {
  product: ProductRow;
  status: Status;
  message?: string;
  generatedUrl?: string;
}

/**
 * Posters below this 0-255 avg luma are considered "black" — almost certainly
 * a fade-in frame that should be replaced. Watch dial macros run ~25 even
 * for dark dials, so 20 is a safe floor.
 */
const BLACK_POSTER_THRESHOLD = 20;

/**
 * One-click backfill for products that have a video but no still cover.
 *
 * Walks every affected product, loads its video silently into a hidden
 * `<video>` element, seeks to ~0.5s, paints the frame to a canvas, encodes
 * it as JPEG, uploads it through the admin signed-URL endpoint, and updates
 * the row's `video_poster_url`. All processing happens client-side so the
 * Vercel function never has to decode video — no ffmpeg dependency.
 */
export function VideoPosterBackfill() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Single hidden <video> reused across jobs to keep DOM tidy.
  const videoRef = useRef<HTMLVideoElement>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from("products")
        .select("id, name, video_url, video_poster_url, media_urls")
        .order("created_at", { ascending: false });
      if (qErr) throw new Error(qErr.message);

      // First pass: shape rows + identify obvious no-cover cases.
      const candidates = (data ?? [])
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          video_url: r.video_url ? String(r.video_url) : null,
          video_poster_url: r.video_poster_url
            ? String(r.video_poster_url)
            : null,
          media_urls: Array.isArray(r.media_urls)
            ? (r.media_urls.filter((x) => typeof x === "string") as string[])
            : [],
        }))
        .filter((p) => !!p.video_url);

      // Second pass: for products that DO claim a poster, probe its
      // brightness. We want to catch the "auto-poster captured a black
      // intro frame" failure mode and queue those for regeneration too.
      const queue: ProductRow[] = [];
      for (const p of candidates) {
        const hasOwnImage = (p.media_urls?.length ?? 0) > 0;
        if (!p.video_poster_url && !hasOwnImage) {
          queue.push({ ...p, reason: "no_cover", existingBrightness: null });
          continue;
        }
        const url = p.video_poster_url ?? p.media_urls[0] ?? null;
        if (!url) continue;
        const brightness = await probeRemoteImageBrightness(url);
        if (brightness === null) {
          // We couldn't probe (CORS / network). Don't touch it — better
          // to leave a possibly-good cover alone than overwrite blindly.
          continue;
        }
        if (brightness < BLACK_POSTER_THRESHOLD) {
          queue.push({
            ...p,
            reason: "black_cover",
            existingBrightness: brightness,
          });
        }
      }

      setJobs(
        queue.map((p) => ({ product: p, status: "pending" as Status }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't scan products");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (open && jobs.length === 0 && !scanning) {
      void scan();
    }
  }, [open, jobs.length, scanning, scan]);

  async function captureOne(product: ProductRow): Promise<string> {
    const vid = videoRef.current;
    if (!vid) throw new Error("video element not mounted");
    if (!product.video_url) throw new Error("no video url");

    // Reset and load fresh source. crossOrigin must be set BEFORE src or
    // the response won't carry CORS headers and canvas will be tainted.
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    vid.src = product.video_url;

    await new Promise<void>((resolve, reject) => {
      const onMeta = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("video failed to load"));
      };
      const cleanup = () => {
        vid.removeEventListener("loadedmetadata", onMeta);
        vid.removeEventListener("error", onErr);
      };
      vid.addEventListener("loadedmetadata", onMeta);
      vid.addEventListener("error", onErr);
      window.setTimeout(() => {
        cleanup();
        if (vid.readyState >= 1) resolve();
        else reject(new Error("video load timeout"));
      }, 12000);
    });

    // Pick the best frame across 8 candidate times — sidesteps fade-in
    // blacks and white flashes.
    const best = await pickBestFrame(vid, {
      samples: 8,
      maxDimension: 1600,
      quality: 0.86,
    });
    if (!best) throw new Error("couldn't capture any frame");
    if (best.brightness < BLACK_POSTER_THRESHOLD) {
      // Even the best frame is essentially black. Either the whole video
      // is dark or we hit a tainted-canvas (CORS) wall. Don't waste an
      // upload on this — leave the product as-is.
      throw new Error("video appears entirely dark or CORS-blocked");
    }
    const file = new File([best.blob], `cover-${product.id}.jpg`, {
      type: "image/jpeg",
    });

    // Ask the admin endpoint for a signed URL, then PUT directly — avoids
    // Vercel's 4.5 MB function body cap. Mirrors the protocol used by
    // MediaUploader.uploadDirect.
    const ticketRes = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "image",
        contentType: "image/jpeg",
        filename: file.name,
      }),
    });
    const ticket = (await ticketRes.json()) as {
      signedUrl?: string;
      publicUrl?: string;
      error?: string;
    };
    if (!ticketRes.ok || !ticket.signedUrl || !ticket.publicUrl) {
      throw new Error(ticket.error ?? "couldn't get upload url");
    }
    const putRes = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: file,
    });
    if (!putRes.ok) throw new Error(`storage put ${putRes.status}`);

    const supabase = createClient();
    const { error: updErr } = await supabase
      .from("products")
      .update({ video_poster_url: ticket.publicUrl })
      .eq("id", product.id);
    if (updErr) throw new Error(updErr.message);
    return ticket.publicUrl;
  }

  async function runAll() {
    if (running) return;
    setRunning(true);
    setError(null);
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (job.status !== "pending") continue;
      setJobs((prev) =>
        prev.map((j, idx) => (idx === i ? { ...j, status: "working" } : j))
      );
      try {
        const url = await captureOne(job.product);
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: "done", generatedUrl: url }
              : j
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed";
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, status: "error", message: msg } : j
          )
        );
      }
    }
    setRunning(false);
  }

  const done = jobs.filter((j) => j.status === "done").length;
  const errored = jobs.filter((j) => j.status === "error").length;
  const total = jobs.length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/10 hover:text-gold-100"
      >
        Backfill video covers
      </button>
    );
  }

  return (
    <div className="rounded-sm border border-white/10 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300/70">
            Video Cover Backfill
          </p>
          <p className="mt-1 text-sm text-white/85">
            {scanning
              ? "Scanning products…"
              : total === 0
              ? "Every product has a still cover. Nothing to do."
              : `Found ${total} product${total === 1 ? "" : "s"} missing a still cover.`}
          </p>
          {error ? (
            <p className="mt-1 text-xs text-red-300">{error}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] uppercase tracking-[0.22em] text-white/40 transition hover:text-white/80"
        >
          Close
        </button>
      </div>

      {total > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running || total === 0}
              className="rounded-sm bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running
                ? `Generating… ${done + errored}/${total}`
                : `Generate covers for ${total}`}
            </button>
            <button
              type="button"
              onClick={() => void scan()}
              disabled={running || scanning}
              className="rounded-sm border border-white/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              Rescan
            </button>
          </div>
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-sm border border-white/5 bg-black/30 p-2">
            {jobs.map((j) => (
              <li
                key={j.product.id}
                className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-xs"
              >
                <span className="truncate text-white/75">{j.product.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${
                    j.status === "done"
                      ? "bg-emerald-500/15 text-emerald-200"
                      : j.status === "working"
                      ? "bg-gold-400/15 text-gold-200"
                      : j.status === "error"
                      ? "bg-red-500/15 text-red-200"
                      : "bg-white/5 text-white/45"
                  }`}
                  title={j.message}
                >
                  {j.status === "done"
                    ? "✓ cover"
                    : j.status === "working"
                    ? "…"
                    : j.status === "error"
                    ? j.message ?? "error"
                    : "pending"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Hidden worker video — reused across all jobs so we don't churn the DOM. */}
      <video ref={videoRef} className="hidden" />
    </div>
  );
}
