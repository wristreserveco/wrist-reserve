"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
};

/**
 * Horizontal strip with chevrons when content overflows — for long product rows
 * (featured, on-wrist), not for a handful of brand collection tiles.
 */
export function HorizontalScrollRow({ children, ariaLabel, className = "" }: Props) {
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
  }, [children, updateScrollHints]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(200, Math.round(el.clientWidth * 0.75));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className={`relative -mx-4 sm:-mx-6 lg:-mx-8 ${className}`}>
      {canScrollLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center bg-gradient-to-r from-black/90 via-black/55 to-transparent sm:w-16">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="pointer-events-auto ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/75 text-xl text-white/90 backdrop-blur transition hover:border-gold-400/45 hover:text-gold-200"
            aria-label={`Scroll ${ariaLabel} left`}
          >
            ‹
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-2 pt-1 sm:gap-6 sm:px-6 lg:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={ariaLabel}
      >
        {children}
      </div>

      {canScrollRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-black/90 via-black/55 to-transparent sm:w-16">
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="pointer-events-auto mr-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/75 text-xl text-white/90 backdrop-blur transition hover:border-gold-400/45 hover:text-gold-200"
            aria-label={`Scroll ${ariaLabel} right`}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
