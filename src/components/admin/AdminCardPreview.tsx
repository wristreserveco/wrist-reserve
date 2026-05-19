"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  cover: string | null | undefined;
  videoUrl?: string | null;
  videoPosterUrl?: string | null;
  videoTrimStart?: number | null;
  videoTrimEnd?: number | null;
  alt: string;
  className?: string;
}

/**
 * Compact video-first preview for admin product cards.
 *
 * Same perf rules as the public `ProductCard`:
 *   - Paints the poster image immediately (zero network cost).
 *   - Only mounts the `<video>` when the card is in view (`IntersectionObserver`).
 *   - `preload="none"` + muted autoplay so nothing streams until we ask for it.
 */
export function AdminCardPreview({
  cover,
  videoUrl,
  videoPosterUrl,
  videoTrimStart,
  videoTrimEnd,
  alt,
  className,
}: Props) {
  const hasVideo = Boolean(videoUrl);
  const poster = videoPosterUrl || cover || null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!hasVideo) return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { rootMargin: "150px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasVideo]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const start = Math.max(0, videoTrimStart ?? 0);
    const end = videoTrimEnd ?? null;
    if (start > 0) {
      try {
        v.currentTime = start;
      } catch {
        /* noop */
      }
    }
    const onTime = () => {
      if (end && v.currentTime >= end - 0.05) v.currentTime = start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [videoUrl, videoTrimStart, videoTrimEnd, inView]);

  return (
    <div
      ref={wrapRef}
      className={
        className ?? "relative h-full w-full overflow-hidden bg-black"
      }
    >
      {poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={poster}
          alt={alt}
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.18em] text-white/30">
          No image
        </div>
      )}
      {hasVideo && inView ? (
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          poster={poster ?? undefined}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
