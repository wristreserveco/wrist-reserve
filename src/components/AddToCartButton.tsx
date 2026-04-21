"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { useCart } from "@/components/providers/CartProvider";

export function AddToCartButton({ product }: { product: Product }) {
  const { addLine } = useCart();
  const [done, setDone] = useState(false);

  function onAdd() {
    if (product.status !== "available") return;
    addLine(product);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={product.status !== "available"}
      className="w-full rounded-sm border border-white/20 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-gold-500/40 hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {done ? "Added" : "Add to Cart"}
    </button>
  );
}
