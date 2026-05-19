"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { useCart } from "@/components/providers/CartProvider";

interface Props {
  product: Product;
  /** How many units to drop into the cart. Defaults to 1. */
  quantity?: number;
}

export function AddToCartButton({ product, quantity = 1 }: Props) {
  const { addLine } = useCart();
  const [done, setDone] = useState(false);

  function onAdd() {
    if (product.status !== "available") return;
    const units = Math.max(1, Math.floor(quantity));
    addLine(product, units);
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
      {done ? "Added" : quantity > 1 ? `Add ${quantity} to Cart` : "Add to Cart"}
    </button>
  );
}
