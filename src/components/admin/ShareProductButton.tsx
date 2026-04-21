"use client";

import { useState } from "react";

interface Props {
  productId: string;
  className?: string;
  label?: string;
}

/**
 * Copies the public storefront URL for a product to the clipboard.
 * Tuned for the "paste into Instagram / DMs" workflow.
 */
export function ShareProductButton({ productId, className, label = "Share" }: Props) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/products/${productId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be blocked in certain webviews.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "rounded-sm border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white/30 hover:text-white"
      }
      title="Copy public product link"
    >
      {copied ? "Link copied" : label}
    </button>
  );
}
