"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export function ProductGallery({
  images,
  videoUrl,
  videoTrimStart,
  videoTrimEnd,
  videoPosterUrl,
  name,
}: {
  images: string[];
  videoUrl: string | null;
  videoTrimStart?: number | null;
  videoTrimEnd?: number | null;
  videoPosterUrl?: string | null;
  name: string;
}) {
  const [active, setActive] = useState(0);
  const slides: { type: "video" | "image"; src: string }[] = [];

  if (videoUrl) slides.push({ type: "video", src: videoUrl });
  images.forEach((src) => slides.push({ type: "image", src }));

  if (slides.length === 0) {
    return (
      <div className="aspect-[4/5] w-full rounded-sm border border-white/10 bg-zinc-950" />
    );
  }

  const current = slides[Math.min(active, slides.length - 1)];

  // For the current slide, we render a blurred "backdrop" copy of the media
  // behind a contained, uncropped version. That way a square IG photo, a tall
  // portrait, and a wide landscape all look polished inside the same frame —
  // exactly how Apple / Shopify / Etsy render product hero images.
  const backdropSrc =
    current.type === "image" ? current.src : videoPosterUrl ?? null;

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-white/10 bg-zinc-950">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${current.type}-${current.src}-${active}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            {/* Blurred backdrop fills the whole frame at any aspect ratio. */}
            {backdropSrc ? (
              <>
                <Image
                  src={backdropSrc}
                  alt=""
                  fill
                  aria-hidden
                  className="scale-110 object-cover opacity-40 blur-2xl"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  unoptimized={backdropSrc.includes("unsplash")}
                />
                <div className="absolute inset-0 bg-black/30" />
              </>
            ) : null}

            {/* Foreground: the real image / video, always shown uncropped. */}
            {current.type === "video" ? (
              <TrimmedVideo
                src={current.src}
                poster={videoPosterUrl ?? undefined}
                start={videoTrimStart ?? 0}
                end={videoTrimEnd ?? null}
                className="relative h-full w-full object-contain"
              />
            ) : (
              <Image
                src={current.src}
                alt={name}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                unoptimized={current.src.includes("unsplash")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {slides.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <button
              key={`${s.type}-${s.src}`}
              type="button"
              onClick={() => setActive(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-sm border transition ${
                i === active ? "border-gold-400/60" : "border-white/10 hover:border-white/25"
              }`}
            >
              {s.type === "video" ? (
                videoPosterUrl ? (
                  <Image
                    src={videoPosterUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <video src={s.src} className="h-full w-full object-cover" muted />
                )
              ) : (
                <Image
                  src={s.src}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized={s.src.includes("unsplash")}
                />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TrimmedVideo({
  src,
  poster,
  start,
  end,
  className,
}: {
  src: string;
  poster?: string;
  start: number;
  end: number | null;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const trimStart = Math.max(0, start || 0);
    const trimEnd = end && end > trimStart ? end : null;
    if (trimStart > 0) {
      try {
        v.currentTime = trimStart;
      } catch {
        /* ignore */
      }
    }
    const onTime = () => {
      if (trimEnd && v.currentTime >= trimEnd - 0.05) {
        v.currentTime = trimStart;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [src, start, end]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      className={className}
      autoPlay
      muted
      loop
      playsInline
    />
  );
}
