"use client";

import { useEffect, useRef, useState } from "react";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ChatWithUsLink } from "@/components/ChatWithUsLink";
import { UrgencyRow } from "@/components/UrgencyRow";
import { PaymentMethodModal, type Rail } from "@/components/PaymentMethodModal";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/lib/types";

interface Props {
  product: Product;
  availableRails: Rail[];
}

export function ProductPurchaseBlock({ product, availableRails }: Props) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [qty, setQty] = useState(1);

  const maxQty = Math.max(1, product.quantity ?? 1);
  // Re-clamp if a background inventory update drops max below current pick.
  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [maxQty, qty]);

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
  // Always show the stepper on in-stock items (capped at current stock) so
  // buyers always see the option — even for 1-in-stock listings.
  const showQtyPicker = !sold;
  const subtotal = product.price * qty;

  return (
    <>
      <UrgencyRow />
      <div ref={inlineRef} className="mt-6 space-y-4">
        {showQtyPicker ? (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">
                Quantity
              </p>
              <p className="mt-0.5 text-[11px] text-white/50">
                {maxQty} in stock · {formatPrice(subtotal)} subtotal
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-sm border border-white/15 bg-black/40 p-1">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="h-8 w-8 rounded-sm text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-30"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-sm text-white">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty}
                className="h-8 w-8 rounded-sm text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          className="w-full rounded-sm bg-white py-4 text-sm font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sold
            ? "Sold Out"
            : qty > 1
            ? `Buy ${qty} · ${formatPrice(subtotal)}`
            : "Buy Now"}
        </button>

        <AddToCartButton product={product} quantity={qty} />
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
              {formatPrice(subtotal)}
              {qty > 1 ? (
                <span className="ml-2 text-xs text-white/50">× {qty}</span>
              ) : null}
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
        quantity={qty}
        availableRails={availableRails}
      />
    </>
  );
}
