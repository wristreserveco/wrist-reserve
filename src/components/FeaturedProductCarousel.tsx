"use client";

import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";

/**
 * Featured row: one horizontal line, swipe / scroll on touch and trackpad.
 */
export function FeaturedProductCarousel({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-white/45">
        No featured pieces yet — mark products as featured in admin.
      </p>
    );
  }

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      <ul
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-2 pt-1 sm:gap-6 sm:px-6 lg:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Featured watches"
      >
        {products.map((p, i) => (
          <li
            key={p.id}
            className="w-[min(82vw,300px)] shrink-0 snap-start sm:w-[300px] md:w-[320px]"
          >
            <ProductCard product={p} index={i} imageSizes="300px" />
          </li>
        ))}
      </ul>
      <p className="mt-3 px-4 text-center text-[10px] uppercase tracking-[0.22em] text-white/30 sm:px-6 lg:hidden">
        Swipe for more →
      </p>
    </div>
  );
}
