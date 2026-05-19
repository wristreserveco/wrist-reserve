"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { Reorder } from "framer-motion";
import {
  pickBestFrame,
  probeRemoteImageBrightness,
} from "@/lib/media/extract-frame";

interface UploadedImage {
  id: string;
  url: string;
  path?: string;
  uploading?: boolean;
  progress?: number;
  previewUrl?: string;
  error?: string;
}

/**
 * Maximum pixel dimension on the longest side. iPhone photos are 4032px
 * wide which is overkill for product photography and costs bandwidth +
 * storage on every page view. Resize anything bigger to 2400px (still
 * sharper than any retina display will ever show on a product card).
 */
const MAX_IMAGE_DIMENSION = 2400;

/** JPEG quality for re-encoded images. 0.86 is visually lossless for
 *  photographs and roughly halves file size vs. iPhone's default. */
const JPEG_QUALITY = 0.86;

/**
 * Decide whether a file should be normalized client-side before upload.
 *
 * We normalize when:
 *  - The MIME type is HEIC/HEIF (Supabase's default storage rules reject
 *    these with an opaque HTML 400 — iPhone exports HEIC by default).
 *  - The extension is `.heic` / `.heif` even if the browser stripped the
 *    MIME type (some iOS share-sheet flows do this).
 *  - The file is over 4 MB AND looks like a photograph (we'll resize +
 *    re-encode as JPEG so uploads stay fast on cellular).
 */
function shouldNormalizeImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  if (name.endsWith(".heic") || name.endsWith(".heif")) return true;
  if (type.startsWith("image/") && file.size > 4 * 1024 * 1024) return true;
  return false;
}

/**
 * Convert a problematic image (HEIC, oversized, etc.) into a safe, sized
 * JPEG entirely in the browser. Returns the original file untouched if
 * we can't decode it (unknown format, broken file, etc.) so the upload
 * can still try the original bytes.
 */
async function normalizeImage(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode-failed"));
      el.src = objectUrl;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return file;

    const longest = Math.max(w, h);
    const scale = longest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longest : 1;
    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* noop */
    }
  }
}

/**
 * WebKit (Safari / iOS) throws `DOMException: The string did not match the
 * expected pattern.` when FormData carries a filename with characters outside
 * a narrow ASCII set (curly quotes, emoji, NBSPs, certain dashes). Both
 * `new File([blob], name, …)` AND `form.append("files", file)` can trip it —
 * but the third-arg override on `.append()` is applied at the multipart
 * boundary, downstream of the File's own name validator. Passing a
 * pre-sanitized name there reliably neutralizes the bug everywhere.
 */
function safeFilename(file: File): string {
  const raw = typeof file?.name === "string" ? file.name : "";
  const dot = raw.lastIndexOf(".");
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot + 1) : "";
  const cleanStem =
    stem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file";
  const cleanExt = ext.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
}

/**
 * Upload a File directly to Supabase Storage using a signed upload URL.
 *
 * Why this exists: Vercel's serverless functions cap request bodies at
 * ~4.5 MB, which breaks any real product photo or video upload. This flow
 * round-trips a tiny JSON request to our API to mint a signed URL, then
 * PUTs the bytes straight to Supabase Storage — no Vercel middleware in
 * the hot path.
 *
 * Returns the resulting public URL on success; throws a labelled error on
 * failure so the UI can show exactly where it broke.
 */
async function uploadDirect(
  kind: "image" | "video",
  file: File
): Promise<string> {
  const filename = safeFilename(file);
  const contentType =
    file.type || (kind === "video" ? "video/mp4" : "image/jpeg");

  let ticketRes: Response;
  try {
    ticketRes = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, filename, contentType }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Couldn't reach the upload service (${msg}).`);
  }

  const ticket = (await ticketRes.json().catch(() => ({}))) as {
    signedUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!ticketRes.ok || !ticket.signedUrl || !ticket.publicUrl) {
    throw new Error(
      ticket.error ||
        `Upload prep failed (HTTP ${ticketRes.status}). Try again or re-login.`
    );
  }

  let putRes: Response;
  try {
    putRes = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: file,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error while uploading (${msg}).`);
  }

  if (!putRes.ok) {
    let detail = "";
    try {
      detail = await putRes.text();
    } catch {
      /* noop */
    }
    if (putRes.status === 413) {
      throw new Error(
        "Upload rejected: file is over the 500 MB storage limit. Trim it first."
      );
    }
    if (putRes.status === 400) {
      // Storage's 400 is almost always a disallowed mime type. We already
      // normalize HEIC client-side before reaching here, so anything that
      // still 400s is an unsupported format the user picked manually.
      throw new Error(
        "Upload rejected: that file format isn't supported. Use JPG, PNG, WEBP, or GIF for images, or MP4 / MOV / WEBM for video."
      );
    }
    // Strip HTML so the surfaced error doesn't dump a raw error page.
    const cleanDetail = detail
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    throw new Error(
      `Upload failed (HTTP ${putRes.status})${cleanDetail ? ` — ${cleanDetail}` : "."}`
    );
  }

  return ticket.publicUrl;
}

interface Props {
  images: string[];
  onImagesChange: (urls: string[]) => void;
  video: {
    url: string | null;
    posterUrl?: string | null;
    trimStart?: number | null;
    trimEnd?: number | null;
  };
  onVideoChange: (video: {
    url: string | null;
    posterUrl: string | null;
    trimStart: number | null;
    trimEnd: number | null;
  }) => void;
}

export function MediaUploader({
  images,
  onImagesChange,
  video,
  onVideoChange,
}: Props) {
  // Keep internal ordering/state keyed so drag-reorder feels stable.
  const [items, setItems] = useState<UploadedImage[]>(() =>
    images.map((url) => ({ id: url, url }))
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [uploadingCount, setUploadingCount] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Video-specific state
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(video.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState<number>(video.trimEnd ?? 0);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Sync external prop changes (e.g., opening a different product)
    setItems(images.map((url) => ({ id: url, url })));
  }, [images]);

  useEffect(() => {
    setTrimStart(video.trimStart ?? 0);
    setTrimEnd(video.trimEnd ?? 0);
  }, [video.trimStart, video.trimEnd, video.url]);

  const handleVideoUpload = useCallback(
    async (file: File) => {
      setVideoUploading(true);
      setGlobalError(null);
      try {
        const publicUrl = await uploadDirect("video", file);
        setTrimStart(0);
        setTrimEnd(0);
        onVideoChange({
          url: publicUrl,
          posterUrl: video.posterUrl ?? null,
          trimStart: 0,
          trimEnd: 0,
        });
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : "Video upload failed");
      } finally {
        setVideoUploading(false);
      }
    },
    [onVideoChange, video.posterUrl]
  );

  // Propagate URL list changes up whenever items array mutates AND uploads are settled.
  useEffect(() => {
    if (uploadingCount > 0) return;
    const urls = items
      .filter((i) => i.url && !i.uploading)
      .map((i) => i.url);
    if (
      urls.length !== images.length ||
      urls.some((u, i) => u !== images[i])
    ) {
      onImagesChange(urls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, uploadingCount]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const imageFiles = list.filter((f) => f.type.startsWith("image/"));
    const videoFiles = list.filter((f) => f.type.startsWith("video/"));

    if (videoFiles.length > 0 && imageFiles.length === 0) {
      await handleVideoUpload(videoFiles[0]);
      return;
    }

    if (imageFiles.length === 0) {
      setGlobalError("No supported files. Drop images or a video.");
      return;
    }

    setGlobalError(null);

    // Create optimistic placeholders with local previews
    const placeholders: UploadedImage[] = imageFiles.map((f) => ({
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${f.name}`,
      url: "",
      uploading: true,
      previewUrl: URL.createObjectURL(f),
      progress: 0,
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setUploadingCount((c) => c + placeholders.length);

    // Upload each file sequentially to keep progress clean (also friendlier on bandwidth).
    for (let i = 0; i < imageFiles.length; i++) {
      const original = imageFiles[i];
      const placeholder = placeholders[i];
      try {
        // HEIC + oversized iPhone photos are the #1 cause of "HTTP 400"
        // failures from Supabase Storage. Normalize before upload so the
        // bytes that hit storage are always a sensibly-sized JPEG.
        const file = shouldNormalizeImage(original)
          ? await normalizeImage(original)
          : original;
        const publicUrl = await uploadDirect("image", file);
        setItems((prev) =>
          prev.map((p) =>
            p.id === placeholder.id
              ? {
                  id: publicUrl,
                  url: publicUrl,
                  uploading: false,
                  progress: 100,
                }
              : p
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setItems((prev) =>
          prev.map((p) =>
            p.id === placeholder.id
              ? { ...p, uploading: false, error: msg }
              : p
          )
        );
        setGlobalError(msg);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
        // revoke object URLs once upload completes
        if (placeholder.previewUrl) {
          try {
            URL.revokeObjectURL(placeholder.previewUrl);
          } catch {
            /* noop */
          }
        }
      }
    }
  }, [handleVideoUpload]);

  function makeCover(id: string) {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  }

  function moveBy(id: string, delta: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.splice(target, 0, picked);
      return next;
    });
  }

  async function removeImage(id: string) {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((p) => p.id !== id));
    if (item?.path || item?.url) {
      try {
        await fetch("/api/admin/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: item.path, url: item.url }),
        });
      } catch {
        // best-effort cleanup; the product still no longer references it.
      }
    }
  }

  async function removeVideo() {
    if (video.url) {
      try {
        await fetch("/api/admin/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: video.url }),
        });
      } catch {
        /* noop */
      }
    }
    onVideoChange({
      url: null,
      posterUrl: null,
      trimStart: null,
      trimEnd: null,
    });
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  }
  async function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      await handleFiles(e.target.files);
      e.target.value = "";
    }
  }
  async function onVideoFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      await handleVideoUpload(e.target.files[0]);
      e.target.value = "";
    }
  }

  function onVideoLoaded() {
    const vid = videoRef.current;
    if (!vid) return;
    const d = Number.isFinite(vid.duration) ? vid.duration : 0;
    setVideoDuration(d);
    if (!video.trimEnd || video.trimEnd > d) {
      setTrimEnd(d);
      onVideoChange({
        url: video.url,
        posterUrl: video.posterUrl ?? null,
        trimStart: video.trimStart ?? 0,
        trimEnd: d,
      });
    }
    // If we don't have a poster yet, grab the current frame shortly after
    // metadata loads and upload it as the cover image. Gives every video a
    // clean, silent-friendly first-impression thumbnail on the storefront.
    if (!video.posterUrl && video.url) {
      void captureAndUploadPoster();
    }
  }

  /**
   * Capture a strong cover frame from the uploaded video and persist it as
   * the product's `video_poster_url`.
   *
   * Reliability ladder — every step is idempotent:
   *   1. Smart sampler: 12 candidate frames in the [10%, 90%] band, scored
   *      by brightness × variance, with fade-in / white-flash penalties.
   *   2. If the best of those 12 is still essentially black (Y<20), escalate
   *      to a rescue pass with 20 samples across the FULL duration (including
   *      the edges that the first pass skipped) and 0.2s manual settle.
   *   3. If even rescue can't find a bright frame, do nothing — the
   *      storefront will fall back to a static <video> tag rendered as
   *      a poster (`#t=0.5`) so the card never looks empty.
   *
   * `setGlobalError` is touched only when something actively went wrong; a
   * "video is genuinely dark" outcome is silent so the admin can pick a
   * better video.
   */
  async function captureAndUploadPoster() {
    const vid = videoRef.current;
    if (!vid) return;
    const BRIGHT_FLOOR = 20; // 0-255 avg luma below which we treat as "black".
    try {
      // First pass — fast (8 samples).
      let result = await pickBestFrame(vid, {
        startTime: video.trimStart ?? 0,
        endTime: video.trimEnd ?? null,
        maxDimension: MAX_IMAGE_DIMENSION,
        quality: JPEG_QUALITY,
        samples: 12,
      });

      // Rescue pass — wider window, more samples. Common reasons we land
      // here: very short clips (<3s) where most of the 10-90% band IS the
      // fade-in/out, or tail-end heavy videos where the subject only
      // appears near the start or end.
      if (!result || result.brightness < BRIGHT_FLOOR) {
        const rescue = await pickBestFrame(vid, {
          startTime: 0,
          endTime: videoDuration || null,
          maxDimension: MAX_IMAGE_DIMENSION,
          quality: JPEG_QUALITY,
          samples: 20,
        });
        if (rescue && rescue.brightness >= BRIGHT_FLOOR) {
          result = rescue;
        } else if (rescue && (!result || rescue.brightness > result.brightness)) {
          // Even rescue couldn't find a bright frame — keep the brighter
          // of the two anyway, so we ship SOMETHING rather than nothing.
          result = rescue;
        }
      }

      if (!result) return;
      // Quality gate — refuse to upload a pure-black poster. The storefront
      // already falls back to the live <video> first-frame in this case.
      if (result.brightness < 5) {
        console.warn(
          `[wrist-reserve] Auto-poster skipped: video appears entirely dark (Y=${result.brightness.toFixed(
            1
          )}). Storefront will render a video frame instead.`
        );
        return;
      }

      const file = new File([result.blob], `poster-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      const publicUrl = await uploadDirect("image", file);
      onVideoChange({
        url: video.url,
        posterUrl: publicUrl,
        trimStart: video.trimStart ?? 0,
        trimEnd: video.trimEnd ?? videoDuration,
      });

      // Post-upload self-check. If for any reason (transcoding, CDN
      // re-encoding) the served bytes ended up dark, surface a non-fatal
      // warning so the admin knows to retry. We don't auto-delete — the
      // poster URL is already committed on the form, and the storefront
      // will still render a non-broken card.
      const remoteY = await probeRemoteImageBrightness(publicUrl);
      if (remoteY !== null && remoteY < BRIGHT_FLOOR) {
        console.warn(
          `[wrist-reserve] Uploaded poster looks dark (Y=${remoteY.toFixed(
            1
          )}) at ${publicUrl}. Run \`npm run fix-covers\` to regenerate.`
        );
      }
    } catch {
      // Most likely a cross-origin tainted-canvas — fall back to no poster,
      // the storefront will just show the first frame of the video element.
    }
  }

  // ---------------------------------------------------------------------------
  // Video → product photos
  //
  // Walks the trim window, captures N evenly-spaced frames as JPEGs, and
  // uploads each one as a regular product image. Single-tap workflow for
  // turning a wrist video into a full image gallery without ever picking
  // up a camera.
  // ---------------------------------------------------------------------------
  const [extractingFrames, setExtractingFrames] = useState(false);

  async function extractFramesAsImages(count = 10) {
    const vid = videoRef.current;
    if (!vid || !video.url) return;
    if (extractingFrames) return;
    setExtractingFrames(true);
    setGlobalError(null);

    const origTime = vid.currentTime;
    const wasPaused = vid.paused;
    const start = Math.max(0, video.trimStart ?? 0);
    const end =
      video.trimEnd && video.trimEnd > start
        ? video.trimEnd
        : videoDuration || vid.duration || 0;
    if (!end || end <= start) {
      setGlobalError("Couldn't read the video duration. Try replaying it once.");
      setExtractingFrames(false);
      return;
    }

    // Evenly spaced inclusive endpoints — e.g. 10 frames means
    // [start, +1/9, +2/9, …, end-tiny] across the trim window.
    const span = end - start;
    const stops: number[] = Array.from({ length: count }, (_, i) =>
      Math.min(end - 0.05, start + (span * i) / Math.max(1, count - 1))
    );

    const placeholders: UploadedImage[] = stops.map((t) => ({
      id: `frame-${Date.now()}-${t.toFixed(2)}-${Math.random().toString(36).slice(2, 6)}`,
      url: "",
      uploading: true,
      progress: 0,
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setUploadingCount((c) => c + placeholders.length);

    if (!wasPaused) vid.pause();

    try {
      for (let i = 0; i < stops.length; i++) {
        const t = stops[i];
        const placeholder = placeholders[i];
        try {
          // Seek and wait for the frame to actually paint.
          if (Math.abs(vid.currentTime - t) > 0.04) {
            vid.currentTime = t;
            await new Promise<void>((resolve) => {
              const onSeeked = () => {
                vid.removeEventListener("seeked", onSeeked);
                resolve();
              };
              vid.addEventListener("seeked", onSeeked);
              window.setTimeout(resolve, 1200);
            });
          }
          const w = vid.videoWidth;
          const h = vid.videoHeight;
          if (!w || !h) throw new Error("Video frame not ready yet.");
          const longest = Math.max(w, h);
          const scale =
            longest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longest : 1;
          const tw = Math.round(w * scale);
          const th = Math.round(h * scale);
          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable.");
          ctx.drawImage(vid, 0, 0, tw, th);
          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
          );
          if (!blob) throw new Error("Couldn't encode frame.");
          const file = new File(
            [blob],
            `frame-${Math.round(t * 1000)}.jpg`,
            { type: "image/jpeg" }
          );
          const publicUrl = await uploadDirect("image", file);
          setItems((prev) =>
            prev.map((p) =>
              p.id === placeholder.id
                ? {
                    id: publicUrl,
                    url: publicUrl,
                    uploading: false,
                    progress: 100,
                  }
                : p
            )
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Frame capture failed.";
          setItems((prev) =>
            prev.map((p) =>
              p.id === placeholder.id
                ? { ...p, uploading: false, error: msg }
                : p
            )
          );
          setGlobalError(msg);
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      }
    } finally {
      // Restore the playhead so the trim controls don't jump.
      try {
        vid.currentTime = origTime;
      } catch {
        /* noop */
      }
      setExtractingFrames(false);
    }
  }

  function commitTrim(nextStart: number, nextEnd: number) {
    onVideoChange({
      url: video.url,
      posterUrl: video.posterUrl ?? null,
      trimStart: nextStart,
      trimEnd: nextEnd,
    });
  }

  function onTrimChange(kind: "start" | "end", value: number) {
    const v = Math.max(0, Math.min(videoDuration, value));
    if (kind === "start") {
      const s = Math.min(v, Math.max(0, trimEnd - 0.5));
      setTrimStart(s);
      if (videoRef.current) videoRef.current.currentTime = s;
      commitTrim(s, trimEnd);
    } else {
      const e = Math.max(v, Math.min(videoDuration, trimStart + 0.5));
      setTrimEnd(e);
      if (videoRef.current) videoRef.current.currentTime = Math.max(0, e - 0.25);
      commitTrim(trimStart, e);
    }
  }

  function playTrimmed() {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = trimStart;
    void vid.play();
  }

  // Clamp playback to the trim window in real time.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (trimEnd > 0 && vid.currentTime >= trimEnd - 0.05) {
        vid.pause();
        vid.currentTime = trimStart;
      }
    };
    vid.addEventListener("timeupdate", onTime);
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [trimStart, trimEnd]);

  const onReorder = useCallback(
    (next: UploadedImage[]) => {
      setItems(next);
    },
    []
  );

  const hasUploads = uploadingCount > 0 || videoUploading;

  const trimDisplay = useMemo(() => {
    const fmt = (t: number) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };
    return {
      start: fmt(trimStart),
      end: fmt(trimEnd || videoDuration),
      total: fmt(videoDuration),
    };
  }, [trimStart, trimEnd, videoDuration]);

  return (
    <div className="space-y-6">
      {/* ---------- Images ---------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">
            Images
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
            Tap ★ to set cover · drag to reorder
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed p-6 text-center transition ${
            dragOver
              ? "border-gold-400 bg-gold-400/5"
              : "border-white/15 bg-black/40 hover:border-white/25"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            className="hidden"
            onChange={onFileInput}
          />
          <div className="text-white/80">
            <p className="text-sm">
              Drop images or a video here, or{" "}
              <span className="underline decoration-dotted underline-offset-2">
                click to browse
              </span>
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              JPG / PNG / WEBP / GIF · MP4 / MOV / WEBM · large files OK (up to ~500MB)
            </p>
          </div>
          {globalError ? (
            <p className="mt-3 text-xs text-red-400/80">{globalError}</p>
          ) : null}
        </div>

        {/* Image grid */}
        {items.length > 0 ? (
          <Reorder.Group
            axis="x"
            values={items}
            onReorder={onReorder}
            className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
          >
            {items.map((item, idx) => (
              <Reorder.Item
                key={item.id}
                value={item}
                whileDrag={{ scale: 1.04, zIndex: 10 }}
                className="group relative aspect-square cursor-grab overflow-hidden rounded-sm border border-white/10 bg-black/60 active:cursor-grabbing"
              >
                {item.previewUrl || item.url ? (
                  <img
                    src={item.previewUrl ?? item.url}
                    alt=""
                    className={`h-full w-full object-cover transition ${
                      item.uploading ? "opacity-40" : ""
                    }`}
                    draggable={false}
                  />
                ) : null}

                {/* Overlay when uploading */}
                {item.uploading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  </div>
                ) : null}

                {/* Primary badge on first image */}
                {idx === 0 && !item.uploading ? (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-sm bg-gold-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-black">
                    Cover
                  </span>
                ) : null}

                {/* Error badge */}
                {item.error ? (
                  <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-sm bg-red-500/90 px-1 py-0.5 text-center text-[9px] uppercase tracking-[0.15em] text-white">
                    Failed
                  </span>
                ) : null}

                {/* Action row — always visible on touch so phones don't need
                 * to rely on drag-to-reorder, which is fiddly with one finger. */}
                {!item.uploading ? (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {idx > 0 ? (
                        <button
                          type="button"
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            makeCover(item.id);
                          }}
                          aria-label="Make cover image"
                          title="Make cover"
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-sm text-gold-300 ring-1 ring-white/20 transition hover:bg-black hover:text-gold-200"
                        >
                          ★
                        </button>
                      ) : null}
                      {idx > 0 ? (
                        <button
                          type="button"
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBy(item.id, -1);
                          }}
                          aria-label="Move left"
                          title="Move left"
                          className="hidden h-7 w-7 items-center justify-center rounded-full bg-black/80 text-sm text-white/85 ring-1 ring-white/20 transition hover:bg-black sm:flex"
                        >
                          ‹
                        </button>
                      ) : null}
                      {idx < items.length - 1 ? (
                        <button
                          type="button"
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBy(item.id, 1);
                          }}
                          aria-label="Move right"
                          title="Move right"
                          className="hidden h-7 w-7 items-center justify-center rounded-full bg-black/80 text-sm text-white/85 ring-1 ring-white/20 transition hover:bg-black sm:flex"
                        >
                          ›
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Delete button — always visible on touch (no hover state),
                 * fades in on hover for desktop so the grid stays clean. */}
                {!item.uploading ? (
                  <button
                    type="button"
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeImage(item.id);
                    }}
                    aria-label="Remove image"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-base text-white opacity-100 ring-1 ring-white/20 transition sm:h-6 sm:w-6 sm:text-sm sm:opacity-0 sm:ring-0 sm:group-hover:opacity-100"
                  >
                    ×
                  </button>
                ) : null}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : null}
      </div>

      {/* ---------- Video ---------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">
            Video
          </p>
          {video.url ? (
            <button
              type="button"
              onClick={() => void removeVideo()}
              className="text-[10px] uppercase tracking-[0.18em] text-red-400/80 hover:text-red-300"
            >
              Remove
            </button>
          ) : null}
        </div>

        {video.url ? (
          <div className="space-y-4 rounded-sm border border-white/10 bg-black/40 p-4">
            <video
              ref={videoRef}
              src={video.url}
              controls
              onLoadedMetadata={onVideoLoaded}
              className="mx-auto max-h-72 w-full rounded-sm bg-black object-contain"
              playsInline
              crossOrigin="anonymous"
            />

            {videoDuration > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/45">
                  <span>Trim window</span>
                  <span>
                    {trimDisplay.start} → {trimDisplay.end}{" "}
                    <span className="text-white/25">· of {trimDisplay.total}</span>
                  </span>
                </div>

                <TrimSlider
                  duration={videoDuration}
                  start={trimStart}
                  end={trimEnd || videoDuration}
                  onChange={onTrimChange}
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-white/45">
                    Drag the handles to set in/out points — storefront auto-plays only
                    within this window.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={playTrimmed}
                      className="rounded-sm border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/80 transition hover:border-white hover:text-white"
                    >
                      Preview ▶
                    </button>
                    <button
                      type="button"
                      onClick={() => void extractFramesAsImages(10)}
                      disabled={extractingFrames || uploadingCount > 0}
                      className="rounded-sm border border-gold-400/40 bg-gold-400/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gold-200 transition hover:border-gold-400 hover:bg-gold-400/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {extractingFrames ? "Pulling…" : "Pull 10 frames →"}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                  Pulls 10 evenly-spaced photos from this trim window and adds
                  them above. Tap ★ on any photo to make it the cover, or drag
                  to reorder.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-white/15 bg-black/40 p-4 text-center">
            <p className="text-sm text-white/70">No video attached.</p>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={videoUploading}
              className="mt-3 inline-flex items-center gap-2 rounded-sm border border-white/15 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/80 transition hover:border-white hover:text-white disabled:opacity-50"
            >
              {videoUploading ? "Uploading…" : "Upload video"}
            </button>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={onVideoFileInput}
            />
          </div>
        )}
      </div>

      {hasUploads ? (
        <p className="text-[11px] uppercase tracking-[0.18em] text-gold-300">
          Uploading…
        </p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dual-thumb trim slider
// -----------------------------------------------------------------------------
interface TrimSliderProps {
  duration: number;
  start: number;
  end: number;
  onChange: (kind: "start" | "end", value: number) => void;
}

function TrimSlider({ duration, start, end, onChange }: TrimSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const pct = (t: number) => (duration === 0 ? 0 : (t / duration) * 100);

  const onPointerDown = (kind: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(kind);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const value = (x / rect.width) * duration;
    onChange(dragging, value);
  };

  const onPointerUp = () => setDragging(null);

  return (
    <div
      ref={trackRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative h-8 w-full select-none"
    >
      {/* Track */}
      <div className="absolute inset-y-3 left-0 right-0 rounded-full bg-white/10" />
      {/* Active window */}
      <div
        className="absolute inset-y-3 rounded-full bg-gold-400/80"
        style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
      />
      {/* Start handle */}
      <button
        type="button"
        aria-label="Trim start"
        onPointerDown={onPointerDown("start")}
        className="absolute top-1/2 -translate-y-1/2 flex h-7 w-3 -translate-x-1/2 items-center justify-center rounded-sm bg-white shadow-lg shadow-black/30 focus:outline-none focus:ring-2 focus:ring-gold-400"
        style={{ left: `${pct(start)}%` }}
      >
        <span className="block h-3 w-[2px] bg-black/40" />
      </button>
      {/* End handle */}
      <button
        type="button"
        aria-label="Trim end"
        onPointerDown={onPointerDown("end")}
        className="absolute top-1/2 -translate-y-1/2 flex h-7 w-3 -translate-x-1/2 items-center justify-center rounded-sm bg-white shadow-lg shadow-black/30 focus:outline-none focus:ring-2 focus:ring-gold-400"
        style={{ left: `${pct(end)}%` }}
      >
        <span className="block h-3 w-[2px] bg-black/40" />
      </button>
    </div>
  );
}
