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

interface UploadedImage {
  id: string;
  url: string;
  path?: string;
  uploading?: boolean;
  progress?: number;
  previewUrl?: string;
  error?: string;
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
        const form = new FormData();
        form.append("kind", "video");
        form.append("files", file);
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          files?: { url: string; path: string }[];
          error?: string;
        };
        if (!res.ok || !data.files?.[0]) {
          throw new Error(data.error || "Video upload failed");
        }
        const uploaded = data.files[0];
        setTrimStart(0);
        setTrimEnd(0);
        onVideoChange({
          url: uploaded.url,
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
      const file = imageFiles[i];
      const placeholder = placeholders[i];
      try {
        const form = new FormData();
        form.append("kind", "image");
        form.append("files", file);
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          files?: { url: string; path: string }[];
          error?: string;
        };
        if (!res.ok || !data.files?.[0]) {
          throw new Error(data.error || "Upload failed");
        }
        const uploaded = data.files[0];
        setItems((prev) =>
          prev.map((p) =>
            p.id === placeholder.id
              ? {
                  id: uploaded.url,
                  url: uploaded.url,
                  path: uploaded.path,
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
   * Capture the current frame of the uploaded video as a JPEG and upload it
   * via the admin media endpoint. Silently no-ops on tainted-canvas errors
   * (shouldn't happen with Supabase public URLs but we want to be defensive).
   */
  async function captureAndUploadPoster() {
    const vid = videoRef.current;
    if (!vid) return;
    try {
      // Seek to a frame just after trim_start for a more flattering thumbnail.
      const target = Math.max(0.1, (video.trimStart ?? 0) + 0.2);
      if (Math.abs(vid.currentTime - target) > 0.1) {
        vid.currentTime = target;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            vid.removeEventListener("seeked", onSeeked);
            resolve();
          };
          vid.addEventListener("seeked", onSeeked);
          // Fallback — don't hang forever if the browser doesn't fire `seeked`.
          window.setTimeout(resolve, 800);
        });
      }
      const width = vid.videoWidth;
      const height = vid.videoHeight;
      if (!width || !height) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(vid, 0, 0, width, height);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
      );
      if (!blob) return;
      const file = new File([blob], `poster-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      const form = new FormData();
      form.append("kind", "image");
      form.append("files", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        files?: { url: string }[];
        error?: string;
      };
      if (!res.ok || !data.files?.[0]) return;
      onVideoChange({
        url: video.url,
        posterUrl: data.files[0].url,
        trimStart: video.trimStart ?? 0,
        trimEnd: video.trimEnd ?? videoDuration,
      });
    } catch {
      // Most likely a cross-origin tainted-canvas — fall back to no poster,
      // the storefront will just show the first frame of the video element.
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
            Drag to reorder · First image is the cover
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

                {/* Delete button (hover) */}
                {!item.uploading ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeImage(item.id);
                    }}
                    aria-label="Remove image"
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
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

                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-white/45">
                    Drag the handles to set in/out points — storefront auto-plays only
                    within this window.
                  </p>
                  <button
                    type="button"
                    onClick={playTrimmed}
                    className="rounded-sm border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 transition hover:border-white hover:text-white"
                  >
                    Preview ▶
                  </button>
                </div>
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
