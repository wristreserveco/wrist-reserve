/**
 * Generate a fresh, non-black still cover for every product that has a
 * video but a bad (black/missing) `video_poster_url`.
 *
 * Algorithm:
 *   1. Pull every product with a video_url from Supabase.
 *   2. Download each video to a temp file.
 *   3. Use ffmpeg to read its duration, sample 8 candidate frames evenly
 *      spaced across the [10%, 90%] band of playable time, score each by
 *      mean brightness penalised at the extremes, and pick the winner.
 *   4. Upload that frame as a JPEG to product-media/images/.
 *   5. Update the product row's `video_poster_url` to the new URL.
 *
 * Idempotent — running it again will skip any product whose existing
 * poster passes the brightness check.
 */

import { createClient } from "@supabase/supabase-js";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const execFileP = promisify(execFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const BUCKET = "product-media";
const BLACK_THRESHOLD = 20; // 0-255 luma; below this = effectively black.
const SAMPLES = 8;
const MAX_DIMENSION = 1600;

interface Product {
  id: string;
  name: string;
  video_url: string | null;
  video_poster_url: string | null;
  media_urls: string[] | null;
}

async function ffprobeDuration(file: string): Promise<number> {
  const ffprobePath = ffmpegPath.replace(/ffmpeg$/, "ffprobe");
  try {
    const { stdout } = await execFileP(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    // Fallback: ffmpeg itself emits Duration to stderr.
    const out = await new Promise<string>((resolve) => {
      const proc = spawn(ffmpegPath, ["-i", file]);
      let buf = "";
      proc.stderr.on("data", (d) => (buf += d.toString()));
      proc.on("close", () => resolve(buf));
    });
    const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

interface Candidate {
  time: number;
  brightness: number;
  variance: number;
  score: number;
  file: string;
}

async function extractFrame(
  video: string,
  time: number,
  outDir: string,
  i: number
): Promise<string | null> {
  const out = path.join(outDir, `cand-${i}.jpg`);
  try {
    await execFileP(ffmpegPath, [
      "-ss",
      String(time),
      "-i",
      video,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      // Cap longest side to MAX_DIMENSION while keeping aspect.
      "-vf",
      `scale='if(gt(iw,ih),min(${MAX_DIMENSION},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_DIMENSION},ih))'`,
      "-y",
      out,
    ]);
    return out;
  } catch {
    return null;
  }
}

async function scoreFrame(
  file: string
): Promise<{ brightness: number; variance: number; score: number }> {
  // signalstats outputs `lavfi.signalstats.YAVG=...` lines. We pipe metadata
  // to stdout via the `metadata=print:file=-` filter, then parse from there.
  try {
    const { stdout } = await execFileP(ffmpegPath, [
      "-i",
      file,
      "-vf",
      "signalstats,metadata=print:file=-",
      "-f",
      "null",
      "-",
    ]);
    const yavg = stdout.match(/YAVG=([\d.]+)/);
    const ymin = stdout.match(/YMIN=([\d.]+)/);
    const ymax = stdout.match(/YMAX=([\d.]+)/);
    const brightness = yavg ? Number(yavg[1]) : 0;
    const variance =
      ymin && ymax ? Number(ymax[1]) - Number(ymin[1]) : 0;
    // Penalise the flats: fade-to-black AND white-flash both score low.
    const factor =
      brightness < 10
        ? brightness / 10
        : brightness > 240
        ? (255 - brightness) / 15
        : 1;
    const score = brightness * (1 + variance / 64) * factor;
    return { brightness, variance, score };
  } catch {
    return { brightness: 0, variance: 0, score: 0 };
  }
}

async function pickBestFrame(
  videoFile: string,
  workDir: string
): Promise<Candidate | null> {
  const dur = await ffprobeDuration(videoFile);
  if (!dur || dur < 0.2) return null;
  const candidates: Candidate[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = 0.1 * dur + ((0.8 * dur) * i) / Math.max(1, SAMPLES - 1);
    const file = await extractFrame(videoFile, t, workDir, i);
    if (!file) continue;
    const s = await scoreFrame(file);
    candidates.push({ time: t, file, ...s });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

async function probeRemotePosterBrightness(
  url: string
): Promise<number | null> {
  try {
    const tmp = path.join(os.tmpdir(), `probe-${Date.now()}.jpg`);
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmp, buf);
    const s = await scoreFrame(tmp);
    fs.unlinkSync(tmp);
    return s.brightness;
  } catch {
    return null;
  }
}

async function downloadVideo(videoUrl: string, dest: string): Promise<void> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function uploadCover(file: string, productId: string): Promise<string> {
  const buf = fs.readFileSync(file);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `images/server-cover-${stamp}-${rand}-${productId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, buf, {
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

async function main() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, video_url, video_poster_url, media_urls");
  if (error) throw error;
  const rows = (data ?? []) as Product[];
  const withVideo = rows.filter((r) => r.video_url);

  console.log(`Found ${withVideo.length} products with videos.\n`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "wr-covers-"));
  let fixed = 0;
  let skipped = 0;
  let errored = 0;

  for (const p of withVideo) {
    process.stdout.write(`• ${p.name.padEnd(48)} `);
    try {
      // Decide if we should regenerate.
      let needFix = false;
      let why = "";
      if (!p.video_poster_url) {
        needFix = true;
        why = "no_poster";
      } else {
        const b = await probeRemotePosterBrightness(p.video_poster_url);
        if (b === null) {
          // Couldn't probe; play it safe and skip.
          console.log("[skip — couldn't probe existing poster]");
          skipped++;
          continue;
        }
        if (b < BLACK_THRESHOLD) {
          needFix = true;
          why = `dark (Y=${b.toFixed(1)})`;
        }
      }

      if (!needFix) {
        console.log("[ok]");
        skipped++;
        continue;
      }

      // Download + sample.
      const vidDir = fs.mkdtempSync(path.join(work, "vid-"));
      const vidFile = path.join(vidDir, "video");
      await downloadVideo(p.video_url!, vidFile);
      const best = await pickBestFrame(vidFile, vidDir);
      if (!best) {
        console.log(`[error: ffmpeg picked nothing]`);
        errored++;
        continue;
      }
      if (best.brightness < BLACK_THRESHOLD) {
        console.log(
          `[error: every sampled frame still dark (Y=${best.brightness.toFixed(
            1
          )})]`
        );
        errored++;
        continue;
      }
      const publicUrl = await uploadCover(best.file, p.id);
      const { error: upErr } = await supabase
        .from("products")
        .update({ video_poster_url: publicUrl })
        .eq("id", p.id);
      if (upErr) {
        console.log(`[db error: ${upErr.message}]`);
        errored++;
        continue;
      }
      console.log(
        `→ fixed (was ${why}, Y=${best.brightness.toFixed(1)}, t=${best.time.toFixed(
          1
        )}s)`
      );
      fixed++;
    } catch (e) {
      console.log(`[error: ${e instanceof Error ? e.message : "unknown"}]`);
      errored++;
    }
  }

  // Best-effort cleanup.
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    /* noop */
  }

  console.log(
    `\nDone. Fixed: ${fixed}  ·  Already-OK: ${skipped}  ·  Errored: ${errored}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
