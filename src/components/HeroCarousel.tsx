"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { HeroCategorySlide } from "@/lib/categories";
import type { HeroSlide } from "@/lib/types";

const INTERVAL_MS = 6000;

// The public hero supports two slide shapes:
// 1. Admin-authored `HeroSlide` records from the `hero_slides` table.
// 2. Auto-generated category slides (legacy fallback).
// We normalize to a single render shape here.
type NormalizedSlide = {
  id: string;
  title: string;
  tagline: string;
  heroImage: string | null;
  heroVideo: string | null;
  ctaLabel: string;
  ctaHref: string;
  variants: { src: string; label?: string }[];
};

function normalizeAdminSlide(s: HeroSlide): NormalizedSlide {
  return {
    id: s.id,
    title: s.title,
    tagline: s.tagline ?? "",
    heroImage: s.image_url,
    heroVideo: s.video_url,
    ctaLabel: s.cta_label ?? "Explore",
    ctaHref: s.cta_href ?? "/shop",
    variants: [],
  };
}

function normalizeCategorySlide(s: HeroCategorySlide): NormalizedSlide {
  return {
    id: s.id,
    title: s.name,
    tagline: s.tagline,
    heroImage: s.heroImage,
    heroVideo: null,
    ctaLabel: `Explore ${s.name}`,
    ctaHref: s.shopHref,
    variants: s.variants,
  };
}

export function HeroCarousel({
  slides,
  adminSlides,
  tierSpotlight,
}: {
  slides: HeroCategorySlide[];
  adminSlides?: HeroSlide[];
  /**
   * Optional synthetic slide featuring our flagship tier. When present we
   * prepend it to whichever slide list is rendering so the tier gets top
   * billing without interfering with the admin's own hero authoring.
   */
  tierSpotlight?: HeroSlide | null;
}) {
  const [index, setIndex] = useState(0);

  const baseNormalized: NormalizedSlide[] =
    adminSlides && adminSlides.length > 0
      ? adminSlides.filter((s) => s.active).map(normalizeAdminSlide)
      : slides.map(normalizeCategorySlide);

  const normalized: NormalizedSlide[] = tierSpotlight
    ? [...baseNormalized, normalizeAdminSlide(tierSpotlight)]
    : baseNormalized;

  const next = useCallback(() => {
    if (normalized.length === 0) return;
    setIndex((i) => (i + 1) % normalized.length);
  }, [normalized.length]);

  useEffect(() => {
    if (normalized.length <= 1) return;
    const t = setInterval(next, INTERVAL_MS);
    return () => clearInterval(t);
  }, [next, normalized.length]);

  if (normalized.length === 0) {
    return (
      <section className="flex min-h-[85vh] items-center justify-center bg-zinc-950">
        <p className="text-sm text-white/40">Loading…</p>
      </section>
    );
  }

  const slide = normalized[Math.min(index, normalized.length - 1)];

  return (
    <section className="relative min-h-[90vh] overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${slide.id}`}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {slide.heroVideo ? (
            <video
              src={slide.heroVideo}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
          ) : slide.heroImage ? (
            <Image
              src={slide.heroImage}
              alt={slide.title}
              fill
              priority
              unoptimized={
                slide.heroImage.includes("unsplash") ||
                slide.heroImage.includes("wikimedia")
              }
              sizes="100vw"
              className="object-cover opacity-80"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 flex min-h-[90vh] flex-col justify-end px-4 pb-14 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_1fr]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`text-${slide.id}`}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-xl"
              >
                <p className="text-xs uppercase tracking-[0.35em] text-gold-400/90">
                  Collection · {String(index + 1).padStart(2, "0")} /{" "}
                  {String(normalized.length).padStart(2, "0")}
                </p>
                <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl md:text-7xl">
                  {slide.title}
                </h1>
                {slide.tagline ? (
                  <p className="mt-5 max-w-md text-base text-white/65">
                    {slide.tagline}
                  </p>
                ) : null}
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link
                    href={slide.ctaHref}
                    className="inline-flex items-center justify-center rounded-sm bg-white px-10 py-4 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200"
                  >
                    {slide.ctaLabel}
                  </Link>
                  <Link
                    href="/shop"
                    className="text-xs uppercase tracking-[0.25em] text-white/55 transition hover:text-gold-200"
                  >
                    Full collection →
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>

            {slide.variants.length > 0 ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`variants-${slide.id}`}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-4 gap-3 lg:ml-auto lg:max-w-md"
                >
                  {slide.variants.map((v, i) => (
                    <motion.div
                      key={`${slide.id}-${v.src}-${i}`}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
                      className="group relative"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-white/10 bg-white/[0.02]">
                        <Image
                          src={v.src}
                          alt={v.label ?? slide.title}
                          fill
                          unoptimized={v.src.includes("unsplash")}
                          sizes="(max-width: 768px) 25vw, 120px"
                          className="object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                        />
                      </div>
                      {v.label ? (
                        <p className="mt-1.5 text-center text-[10px] uppercase tracking-[0.18em] text-white/45">
                          {v.label}
                        </p>
                      ) : null}
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            ) : null}
          </div>

          {normalized.length > 1 ? (
            <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6">
              {normalized.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Show ${s.title}`}
                  onClick={() => setIndex(i)}
                  className={`group flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] transition ${
                    i === index ? "text-white" : "text-white/35 hover:text-white/70"
                  }`}
                >
                  <span
                    className={`block h-px transition-all ${
                      i === index
                        ? "w-10 bg-gold-400"
                        : "w-5 bg-white/25 group-hover:w-7"
                    }`}
                  />
                  {s.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
