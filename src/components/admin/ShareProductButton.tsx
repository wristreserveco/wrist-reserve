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
export function ShareProductButton({ productId, className, label = "Copy link" }: Props) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/products/${productId}`
      : `/products/${productId}`;

  async function onClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers / locked-down webviews.
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* give up silently */
      }
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
      title={`Click to copy: ${url}`}
    >
      {copied ? "Link copied ✓" : label}
    </button>
  );
}
