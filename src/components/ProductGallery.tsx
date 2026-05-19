"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

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
  const [direction, setDirection] = useState<1 | -1>(1);
  const slides: { type: "video" | "image"; src: string }[] = [];

  // Still images first (admin gallery order = hero cover), then video — so the
  // default slide is never raw autoplay video before the buyer swipes to watch.
  images.forEach((src) => slides.push({ type: "image", src }));
  if (videoUrl) slides.push({ type: "video", src: videoUrl });

  if (slides.length === 0) {
    return (
      <div className="aspect-[4/5] w-full rounded-sm border border-white/10 bg-zinc-950" />
    );
  }

  const total = slides.length;
  const safeIndex = Math.min(active, total - 1);
  const current = slides[safeIndex];

  function goTo(next: number) {
    if (next === safeIndex) return;
    const clamped = Math.max(0, Math.min(total - 1, next));
    setDirection(clamped > safeIndex ? 1 : -1);
    setActive(clamped);
  }

  function next() {
    goTo(safeIndex < total - 1 ? safeIndex + 1 : 0);
  }
  function prev() {
    goTo(safeIndex > 0 ? safeIndex - 1 : total - 1);
  }

  // For the current slide, we render a blurred "backdrop" copy of the media
  // behind a contained, uncropped version. That way a square IG photo, a tall
  // portrait, and a wide landscape all look polished inside the same frame.
  const backdropSrc =
    current.type === "image" ? current.src : videoPosterUrl ?? null;

  // Slide enter/exit offsets — the active slide swipes in from the side
  // the user dragged FROM, matching native iOS photo-viewer feel.
  const variants = {
    enter: (dir: 1 | -1) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: 1 | -1) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="group relative aspect-[4/5] touch-pan-y select-none overflow-hidden rounded-sm border border-white/10 bg-zinc-950">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={`${current.type}-${current.src}-${safeIndex}`}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 320, damping: 36 },
              opacity: { duration: 0.18 },
            }}
            drag={total > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              const dx = info.offset.x;
              const vx = info.velocity.x;
              // Either a long drag or a fast flick triggers a slide change.
              if (dx < -60 || vx < -400) next();
              else if (dx > 60 || vx > 400) prev();
            }}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
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
                className="pointer-events-none relative h-full w-full object-contain"
              />
            ) : (
              <Image
                src={current.src}
                alt={name}
                fill
                draggable={false}
                className="pointer-events-none object-contain"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                placeholder="blur"
                blurDataURL={LUXE_BLUR_DATA_URL}
                unoptimized={shouldUnoptimize(current.src)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Slide counter pill — orientation marker on every slide. */}
        {total > 1 ? (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium tracking-[0.15em] text-white/90 backdrop-blur-sm">
            {safeIndex + 1} / {total}
          </div>
        ) : null}

        {/* Desktop arrow controls — fade in on hover, never crowd mobile. */}
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/75 sm:flex"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/75 sm:flex"
            >
              ›
            </button>
          </>
        ) : null}

        {/* Dot indicators — primary mobile affordance for jumping slides. */}
        {total > 1 && total <= 12 ? (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Thumbnail rail — desktop only. Mobile relies on swipe + dots so the
       * hero image gets all the room. */}
      {total > 1 ? (
        <div className="hidden gap-2 overflow-x-auto pb-1 sm:flex">
          {slides.map((s, i) => (
            <button
              key={`${s.type}-${s.src}`}
              type="button"
              onClick={() => goTo(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-sm border transition ${
                i === safeIndex ? "border-gold-400/60" : "border-white/10 hover:border-white/25"
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
                  placeholder="blur"
                  blurDataURL={LUXE_BLUR_DATA_URL}
                  unoptimized={shouldUnoptimize(s.src)}
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
