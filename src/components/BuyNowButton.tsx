"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

interface BuyNowButtonProps {
  product: Product;
  variant?: "default" | "compact";
}

export function BuyNowButton({
  product,
  variant = "default",
}: BuyNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onBuy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Checkout failed");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || product.status !== "available";

  const compact = variant === "compact";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => void onBuy()}
        disabled={disabled}
        className={
          compact
            ? "w-full rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            : "w-full rounded-sm bg-white py-4 text-sm font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        }
      >
        {loading ? "Redirecting…" : product.status !== "available" ? "Sold Out" : "Buy Now"}
      </button>
      {error ? <p className="mt-3 text-center text-xs text-red-400/90">{error}</p> : null}
    </div>
  );
}
