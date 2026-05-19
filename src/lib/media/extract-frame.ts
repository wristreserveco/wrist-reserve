/**
 * Pick the best cover frame from a video element.
 *
 * Walks N candidate times across the playable duration, draws each frame to
 * a small scoring canvas, and picks the one with the highest "interesting
 * pixel" score — a combination of brightness and variance. The reason for
 * both:
 *
 *   - Brightness alone fails on white-flash intro frames.
 *   - Variance alone fails on dark-but-uniform frames (a black dial macro).
 *
 * Score = avg_brightness * (1 + variance / 255). Frames that are flatly
 * black or flatly white score low; frames with subject detail score high.
 *
 * Returns the best frame as a high-quality JPEG canvas at the video's
 * native resolution (capped by `maxDimension`). Returns null if no
 * frame could be captured at all (e.g. video failed to decode).
 */
export interface BestFrameOptions {
  /** Number of candidate times to sample. Defaults to 8 across [10%-90%]. */
  samples?: number;
  /** Longest-side pixel cap for the final output. Defaults to 1600. */
  maxDimension?: number;
  /** JPEG quality 0-1. Defaults to 0.86. */
  quality?: number;
  /**
   * Override the trim window. By default we use the whole video, but for
   * admin uploads where the user has set a trim we want to sample inside
   * that window only.
   */
  startTime?: number;
  endTime?: number | null;
}

export interface BestFrameResult {
  blob: Blob;
  width: number;
  height: number;
  /** 0-255 average luminance of the chosen frame. Useful for diagnostics. */
  brightness: number;
  /** Time in seconds where the chosen frame was captured. */
  time: number;
}

/**
 * Seek the video and wait until the seeked event fires (or timeout).
 */
async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(video.currentTime - t) < 0.04) return;
  video.currentTime = t;
  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    window.setTimeout(resolve, 1500);
  });
}

/**
 * Compute brightness + variance scoring on a small downsampled canvas of
 * the current video frame. Fast — 32x32 grid = 1024 pixels.
 */
function scoreCurrentFrame(video: HTMLVideoElement): {
  brightness: number;
  variance: number;
  score: number;
} {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return { brightness: 0, variance: 0, score: 0 };
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { brightness: 0, variance: 0, score: 0 };
  try {
    ctx.drawImage(video, 0, 0, 32, 32);
  } catch {
    // Tainted canvas — we can't score, treat as zero.
    return { brightness: 0, variance: 0, score: 0 };
  }
  const data = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  let count = 0;
  const lums: number[] = new Array(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lums[count] = y;
    sum += y;
    count++;
  }
  const brightness = sum / count;
  let varSum = 0;
  for (let i = 0; i < count; i++) {
    const d = lums[i] - brightness;
    varSum += d * d;
  }
  const variance = Math.sqrt(varSum / count);
  // Bias against flat black AND flat white: penalise scores when brightness
  // is below 10/255 (likely intro fade) or above 240/255 (likely flash).
  const brightnessFactor =
    brightness < 10 ? brightness / 10 : brightness > 240 ? (255 - brightness) / 15 : 1;
  const score = brightness * (1 + variance / 64) * brightnessFactor;
  return { brightness, variance, score };
}

/**
 * Draw the current video frame to a properly-sized output canvas and
 * encode it as a JPEG blob.
 */
async function encodeCurrentFrame(
  video: HTMLVideoElement,
  maxDimension: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const longest = Math.max(w, h);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, tw, th);
  } catch {
    return null;
  }
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) return null;
  return { blob, width: tw, height: th };
}

/**
 * Sample the video at N candidate times and return the best-scoring frame
 * as a JPEG blob ready for upload.
 */
export async function pickBestFrame(
  video: HTMLVideoElement,
  options: BestFrameOptions = {}
): Promise<BestFrameResult | null> {
  if (!video.videoWidth || !video.videoHeight) {
    // Try to nudge metadata
    if (video.readyState < 1) return null;
  }

  const samples = Math.max(3, options.samples ?? 8);
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.86;
  const totalDuration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!totalDuration) return null;
  const rawStart = Math.max(0, options.startTime ?? 0);
  const rawEnd =
    options.endTime && options.endTime > rawStart
      ? Math.min(options.endTime, totalDuration)
      : totalDuration;
  const span = rawEnd - rawStart;
  if (span < 0.1) return null;

  // Evenly spaced times inside the [10%, 90%] band of the playable window.
  // Skipping the absolute edges avoids fade-in / fade-out artefacts.
  const band = { lo: 0.1, hi: 0.9 };
  const times: number[] = Array.from({ length: samples }, (_, i) => {
    const t = band.lo + ((band.hi - band.lo) * i) / Math.max(1, samples - 1);
    return rawStart + span * t;
  });

  let bestScore = -Infinity;
  let bestTime = times[0];
  let bestBrightness = 0;

  for (const t of times) {
    try {
      await seekTo(video, t);
    } catch {
      continue;
    }
    const s = scoreCurrentFrame(video);
    if (s.score > bestScore) {
      bestScore = s.score;
      bestTime = t;
      bestBrightness = s.brightness;
    }
  }

  // If every sample scored zero (e.g. tainted canvas), bail. Caller can
  // fall back to a fixed mid-point capture and accept whatever it gets.
  if (bestScore <= 0) {
    await seekTo(video, rawStart + span * 0.5);
    const out = await encodeCurrentFrame(video, maxDimension, quality);
    if (!out) return null;
    return {
      blob: out.blob,
      width: out.width,
      height: out.height,
      brightness: 0,
      time: rawStart + span * 0.5,
    };
  }

  await seekTo(video, bestTime);
  const out = await encodeCurrentFrame(video, maxDimension, quality);
  if (!out) return null;
  return {
    blob: out.blob,
    width: out.width,
    height: out.height,
    brightness: bestBrightness,
    time: bestTime,
  };
}

/**
 * Cheap brightness check of a remote image URL. Loads the image cross-origin,
 * draws it onto a 32x32 canvas, returns average luma. Returns null if we
 * can't decode (CORS / network) — caller should treat that as "unknown".
 */
export async function probeRemoteImageBrightness(
  url: string
): Promise<number | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}
