"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Testimonial } from "@/lib/types";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

interface Props {
  testimonials: Testimonial[];
}

/**
 * Deterministic per-card style.
 *
 * Each testimonial gets a fixed tiny tilt + a tiny rotation jitter that
 * the CSS `wr-wiggle` animation oscillates around. Cards never translate,
 * so they always sit exactly where the masonry put them.
 *
 * Seeded off the row id so the visual is stable across renders (no SSR
 * hydration mismatch).
 */
function seededParams(id: string): React.CSSProperties {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r1 = ((h >>> 0) % 1000) / 1000;
  const r2 = (((h >>> 8) >>> 0) % 1000) / 1000;
  const r3 = (((h >>> 16) >>> 0) % 1000) / 1000;
  const r4 = ((h * 31) >>> 0) % 1000 / 1000;

  const rot = (r1 * 2.4 - 1.2).toFixed(2);  // -1.2 .. +1.2 deg base tilt
  const wig = (0.25 + r2 * 0.45).toFixed(2); // 0.25 .. 0.7 deg wiggle
  const dur = (5 + r3 * 3).toFixed(2);       // 5 .. 8 s per cycle
  const delay = (r4 * 3).toFixed(2);          // 0 .. 3 s offset

  return {
    "--rot": `${rot}deg`,
    "--wig": `${wig}deg`,
    "--dur": `${dur}s`,
    "--delay": `${delay}s`,
  } as React.CSSProperties;
}

/**
 * Public "Word of Mouth" wall.
 *
 * Each testimonial is rendered as a black card with a thin gold rim — no
 * polaroid border, no caption strip beneath. The screenshot itself already
 * carries the message, so we let it speak for itself; the caption text is
 * surfaced ONLY in the lightbox so the wall stays clean.
 *
 * Layout uses tight CSS-column masonry so a typical viewport shows the
 * full collection at once without long scroll.
 */
export function WordOfMouthWall({ testimonials }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pre-compute the per-card style + display date once.
  const enriched = useMemo(
    () =>
      testimonials.map((t) => ({
        ...t,
        _style: seededParams(t.id),
        _date: formatDate(t.posted_at || t.created_at),
      })),
    [testimonials]
  );

  // ESC closes the lightbox.
  useEffect(() => {
    if (!activeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  const active = activeId
    ? testimonials.find((t) => t.id === activeId) || null
    : null;

  if (testimonials.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center text-white/55">
        <p className="font-display text-2xl text-white">
          The wall is being assembled.
        </p>
        <p className="mt-3 text-sm">
          Reviews from buyers, DMs, and IG threads will land here soon.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* MOBILE LAYOUT — manual two-column grid.
       *
       * CSS multi-column tries to "balance" heights, which means a single
       * tall iMessage screenshot in column 1 will push column 2's first
       * card downward to even things out. Buyer told us that looks like
       * a void at the top-right of the wall.
       *
       * Fix: render two explicit flex columns and alternate cards between
       * them. Both columns ALWAYS start flush at the top; if one column
       * ends up taller (because its cards are taller), the other column
       * just ends earlier — but neither column has a phantom gap at the
       * top. */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <div className="flex flex-col gap-3">
          {enriched
            .filter((_, i) => i % 2 === 0)
            .map((t) => renderCard(t, setActiveId))}
        </div>
        <div className="flex flex-col gap-3">
          {enriched
            .filter((_, i) => i % 2 === 1)
            .map((t) => renderCard(t, setActiveId))}
        </div>
      </div>

      {/* TABLET / DESKTOP LAYOUT — true CSS-column masonry.
       *
       * On wider viewports we get 3–5 columns and the natural CSS-column
       * balance reads as a tight, magazine-style wall rather than a
       * scattered grid. Gap stays small so the cards feel connected. */}
      <div className="hidden gap-3 sm:block sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
        {enriched.map((t) => (
          <div key={t.id} className="mb-3 break-inside-avoid">
            {renderCard(t, setActiveId)}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {active ? (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
            onClick={() => setActiveId(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-xl overflow-hidden rounded-sm border border-gold-400/40 bg-black shadow-[0_30px_80px_-20px_rgba(212,175,55,0.25),_0_20px_60px_-30px_rgba(0,0,0,0.9)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActiveId(null)}
                aria-label="Close"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/30 bg-black/80 text-gold-100 backdrop-blur transition hover:border-gold-400/70 hover:text-white"
              >
                ×
              </button>
              <div className="relative w-full bg-black">
                <Image
                  src={active.image_url}
                  alt={active.caption || "Buyer testimonial"}
                  width={1000}
                  height={1500}
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="block h-auto max-h-[80vh] w-full object-contain"
                  placeholder="blur"
                  blurDataURL={LUXE_BLUR_DATA_URL}
                  unoptimized={shouldUnoptimize(active.image_url)}
                  priority
                />
              </div>
              {(active.caption || active.posted_at) ? (
                <div className="border-t border-gold-500/15 bg-black/90 px-5 py-4">
                  {active.caption ? (
                    <p className="font-serif text-sm italic leading-snug text-white/85 sm:text-base">
                      &ldquo;{active.caption}&rdquo;
                    </p>
                  ) : null}
                  <p className="mt-2 text-right text-[10px] uppercase tracking-[0.22em] text-white/40">
                    {formatDate(active.posted_at || active.created_at) || ""}
                  </p>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Card markup shared by both the mobile two-column grid and the
 *  tablet/desktop CSS-column masonry. Same DOM, same look — only the
 *  enclosing layout changes. */
type EnrichedTestimonial = Testimonial & {
  _style: React.CSSProperties;
  _date: string;
};

function renderCard(
  t: EnrichedTestimonial,
  setActiveId: (id: string) => void
) {
  return (
    <button
      key={t.id}
      type="button"
      onClick={() => setActiveId(t.id)}
      className="block w-full text-left"
      aria-label={
        t.caption ||
        `${t.customer_name || "A buyer"}'s message — open larger`
      }
    >
      <div className="wr-float w-full" style={t._style}>
        {/* Black card, thin gold rim. Faint inner gold glow on hover. */}
        <div className="group relative overflow-hidden rounded-sm border border-gold-500/30 bg-black shadow-[0_14px_30px_-14px_rgba(0,0,0,0.7)] transition-shadow duration-500 hover:border-gold-400/70 hover:shadow-[0_22px_50px_-14px_rgba(212,175,55,0.25),_0_10px_24px_-10px_rgba(0,0,0,0.85)]">
          <Image
            src={t.image_url}
            alt={t.caption || "Buyer testimonial"}
            width={800}
            height={1200}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="block h-auto w-full"
            placeholder="blur"
            blurDataURL={LUXE_BLUR_DATA_URL}
            unoptimized={shouldUnoptimize(t.image_url)}
          />
          {t._date ? (
            <div className="border-t border-gold-500/15 bg-black px-2.5 py-1.5 text-center text-[9px] uppercase tracking-[0.22em] text-white/45">
              {t._date}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
