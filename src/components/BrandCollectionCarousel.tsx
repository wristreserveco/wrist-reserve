"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { BrandCollectionCard } from "@/lib/collections";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

export function BrandCollectionCarousel({ cards }: { cards: BrandCollectionCard[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollHints();
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollHints);
      ro.disconnect();
    };
  }, [cards, updateScrollHints]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(200, Math.round(el.clientWidth * 0.75));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  if (cards.length === 0) return null;

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {canScrollLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center bg-gradient-to-r from-black/90 via-black/55 to-transparent sm:w-16">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="pointer-events-auto ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/75 text-xl text-white/90 backdrop-blur transition hover:border-gold-400/45 hover:text-gold-200"
            aria-label="Scroll collections left"
          >
            ‹
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 pt-1 sm:gap-5 sm:px-6 lg:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Shop by brand"
      >
        {cards.map((c) => (
          <Link
            key={c.id}
            href={c.shopHref}
            className="group relative block w-[min(72vw,260px)] shrink-0 snap-start overflow-hidden rounded-sm border border-white/10 bg-zinc-950 sm:w-[240px] md:w-[260px]"
          >
            <div className="relative aspect-[4/5]">
              <Image
                src={c.coverImage}
                alt={c.name}
                fill
                sizes="260px"
                className="object-cover transition duration-700 group-hover:scale-[1.04]"
                placeholder="blur"
                blurDataURL={LUXE_BLUR_DATA_URL}
                unoptimized={shouldUnoptimize(c.coverImage)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-display text-xl text-white">{c.name}</p>
                {c.tagline ? (
                  <p className="mt-1 text-xs text-white/60">{c.tagline}</p>
                ) : null}
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                  {c.pieceCount === 1 ? "1 piece in stock" : `${c.pieceCount} pieces in stock`}
                </p>
                <p className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-gold-300 transition group-hover:text-gold-100">
                  Explore →
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {canScrollRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-black/90 via-black/55 to-transparent sm:w-16">
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="pointer-events-auto mr-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/75 text-xl text-white/90 backdrop-blur transition hover:border-gold-400/45 hover:text-gold-200"
            aria-label="Scroll collections right"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
