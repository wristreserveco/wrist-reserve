"use client";

/**
 * Payment chooser — payment rails only. Ship-to / email come from PayPal,
 * NOWPayments, or post-payment follow-up; no address gate in this modal.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/products";
import { PayPalCheckoutButtons } from "../PayPalCheckoutButtons";

export type Rail = "paypal" | "crypto";

interface PaymentMethodModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  /** Units the buyer wants to purchase. Defaults to 1. */
  quantity?: number;
  availableRails: Rail[];
}

const RAIL_COPY: Record<
  Rail,
  { title: string; subtitle: string; tag?: string; logo: React.ReactNode }
> = {
  paypal: {
    title: "Pay with PayPal",
    subtitle: "",
    logo: <PaypalMark />,
  },
  crypto: {
    title: "Pay with Crypto",
    subtitle: "USDT · BTC · ETH · 60 more · instant settlement",
    tag: "Fastest",
    logo: <CryptoMark />,
  },
};

export function PaymentMethodModal({
  open,
  onClose,
  product,
  quantity = 1,
  availableRails,
}: PaymentMethodModalProps) {
  const qty = Math.max(1, Math.floor(quantity));
  const subtotal = product.price * qty;
  const [loading, setLoading] = useState<Rail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setLoading(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose, loading]);

  async function startCrypto() {
    setLoading("crypto");
    setError(null);
    try {
      const res = await fetch("/api/checkout/crypto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity: qty,
        }),
      });
      const data = (await res.json()) as { invoiceUrl?: string; error?: string };
      if (!res.ok || !data.invoiceUrl) {
        throw new Error(data.error || "Crypto checkout couldn't be started");
      }
      window.location.href = data.invoiceUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crypto checkout couldn't be started");
      setLoading(null);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md sm:items-center sm:p-6"
          onClick={loading ? undefined : onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.7)] sm:rounded-2xl"
          >
            <div className="relative border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/70">
                    Payment
                  </p>
                  <h2 className="mt-1.5 truncate font-display text-2xl text-white">
                    {product.name}
                  </h2>
                  <p className="mt-1.5 text-sm text-white/55">
                    {formatPrice(subtotal)}
                    {qty > 1 ? (
                      <span className="ml-2 text-white/35">
                        · {qty} × {formatPrice(product.price)}
                      </span>
                    ) : null}
                  </p>
                </div>
                {!loading ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/45 transition hover:border-white/30 hover:text-white"
                  >
                    Close
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-6 sm:max-h-[80vh]">
              {error ? (
                <p className="mb-5 rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {error}
                </p>
              ) : null}

              {availableRails.length === 0 ? (
                <div className="rounded-sm border border-white/10 bg-white/[0.02] px-4 py-6 text-center">
                  <p className="text-sm text-white/65">Checkout is being configured.</p>
                  <p className="mt-1 text-xs text-white/40">
                    Reach out via chat — we&rsquo;ll process your order personally.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <section className="space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/70">
                      Payment
                    </p>

                    {availableRails.includes("paypal") ? (
                      <div className="space-y-2">
                        <div className="rounded-sm border border-gold-400/25 bg-gradient-to-r from-gold-400/[0.05] to-transparent p-3">
                          <PayPalCheckoutButtons
                            productId={product.id}
                            quantity={qty}
                            disabled={loading !== null}
                            onError={(msg) => setError(msg)}
                          />
                        </div>
                      </div>
                    ) : null}

                    {availableRails.includes("crypto") ? (
                      <div className="space-y-3">
                        {availableRails.includes("paypal") ? (
                          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-white/30">
                            <span className="h-px flex-1 bg-white/10" />
                            <span>Or</span>
                            <span className="h-px flex-1 bg-white/10" />
                          </div>
                        ) : null}
                        <RailButton
                          rail="crypto"
                          loading={loading === "crypto"}
                          disabled={loading !== null && loading !== "crypto"}
                          onClick={() => void startCrypto()}
                        />
                      </div>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function RailButton({
  rail,
  loading,
  disabled,
  onClick,
}: {
  rail: Rail;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const copy = RAIL_COPY[rail];
  const featured = rail === "paypal";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-sm border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        featured
          ? "border-gold-400/35 bg-gradient-to-r from-gold-400/[0.06] to-transparent hover:border-gold-300/70 hover:from-gold-400/[0.1]"
          : "border-white/10 bg-white/[0.015] hover:border-white/30 hover:bg-white/[0.04]"
      }`}
    >
      {featured ? (
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold-200/[0.08] to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      ) : null}

      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border ${
          featured ? "border-gold-300/40 bg-gold-400/10" : "border-white/15 bg-black/40"
        }`}
      >
        {copy.logo}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{copy.title}</span>
          {copy.tag ? (
            <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.22em] text-gold-200">
              {copy.tag}
            </span>
          ) : null}
        </div>
        {copy.subtitle ? (
          <p className="mt-1 truncate text-xs text-white/50">{copy.subtitle}</p>
        ) : null}
      </div>

      <span
        className={`text-base transition ${
          loading
            ? "text-white"
            : "text-white/30 group-hover:translate-x-1 group-hover:text-white/80"
        }`}
        aria-hidden
      >
        {loading ? <Spinner /> : "→"}
      </span>
    </button>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}

function PaypalMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-gold-200" fill="currentColor">
      <path d="M7.5 5h6.4c2.7 0 4.5 1.4 4 4.2-.5 3-2.8 4.5-5.6 4.5h-2L9.5 19H6.7L7.5 5zm2.6 1.6L9.4 11h2c1.7 0 3-.8 3.3-2.6.2-1.5-.8-1.8-2.4-1.8h-2.2zm5 6.5h.7c2.6 0 4.4-1.3 4.8-3.9.4-2.6-1.4-3.7-3.7-3.7l.5 7.6z" />
    </svg>
  );
}

function CryptoMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-white/85"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.5 7.5h4.2c1.4 0 2.4 1 2.4 2.2 0 .9-.5 1.5-1.2 1.9.9.3 1.6 1.1 1.6 2.1 0 1.5-1.2 2.5-2.8 2.5H9.5z" />
      <path d="M9.5 11.6h4.2" />
      <path d="M11 6v1.5M11 16.2V18M13 6v1.5M13 16.2V18" />
    </svg>
  );
}
