"use client";

import { useEffect, useRef, useState } from "react";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ChatWithUsLink } from "@/components/ChatWithUsLink";
import { UrgencyRow } from "@/components/UrgencyRow";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/lib/types";
import type { ManualMethod } from "@/lib/payments/manual";

type Rail = "crypto" | "stripe" | "manual";

interface Props {
  product: Product;
  availableRails: Rail[];
  manualMethods: ManualMethod[];
}

export function ProductPurchaseBlock({
  product,
  availableRails,
  manualMethods,
}: Props) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const el = inlineRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sold = product.status !== "available";
  const disabled = sold;

  return (
    <>
      <UrgencyRow />
      <div ref={inlineRef} className="mt-6 space-y-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          className="w-full rounded-sm bg-white py-4 text-sm font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sold ? "Sold Out" : "Buy Now"}
        </button>
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-white/35">
          Crypto · Zelle · Cash App · Card · Apple Pay
        </p>

        <AddToCartButton product={product} />
        <ChatWithUsLink />
      </div>

      <div
        aria-hidden={!showSticky}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
          showSticky ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] uppercase tracking-[0.22em] text-white/50">
              {product.brand ?? "Wrist Reserve"}
            </p>
            <p className="truncate font-display text-lg leading-tight text-white">
              {formatPrice(product.price)}
            </p>
          </div>
          <div className="w-40">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setModalOpen(true)}
              className="w-full rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sold ? "Sold Out" : "Buy Now"}
            </button>
          </div>
        </div>
      </div>

      <PaymentMethodModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={product}
        availableRails={availableRails}
        manualMethods={manualMethods}
      />
    </>
  );
}
