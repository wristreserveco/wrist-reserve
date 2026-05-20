"use client";

import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";
import { HorizontalScrollRow } from "@/components/HorizontalScrollRow";

/** Recently shipped / on-wrist row — scroll when the list grows. */
export function OnWristCarousel({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-white/45">
        Nothing spotlighted on wrists yet — toggle &quot;On wrist&quot; in admin on sold pieces.
      </p>
    );
  }

  return (
    <HorizontalScrollRow ariaLabel="Already on wrists">
      {products.map((p, i) => (
        <div
          key={p.id}
          className="w-[min(82vw,300px)] shrink-0 snap-start sm:w-[300px] md:w-[320px]"
        >
          <ProductCard product={p} index={i} imageSizes="300px" />
        </div>
      ))}
    </HorizontalScrollRow>
  );
}
