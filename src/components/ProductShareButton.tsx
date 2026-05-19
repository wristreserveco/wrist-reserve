"use client";

import { useState } from "react";

interface Props {
  productName: string;
  className?: string;
}

/**
 * Two-button pair on the public product page:
 *   1. Share — opens the native share sheet on mobile (iOS/Android show
 *      Instagram, Messages, WhatsApp, + "Copy" option). On desktop, falls
 *      back to copying the URL.
 *   2. Copy link — always copies the URL to clipboard (explicit option so
 *      the admin or buyer can grab it fast to paste in an IG story).
 */
export function ProductShareButton({ productName, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  async function copyUrl() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
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

  async function share() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function";

    if (canNativeShare) {
      try {
        await navigator.share({
          title: productName,
          text: `${productName} — Wrist Reserve`,
          url,
        });
        setShared(true);
        setTimeout(() => setShared(false), 1500);
        return;
      } catch {
        // User dismissed the sheet or it's unavailable — fall through to copy.
      }
    }

    await copyUrl();
  }

  const wrapClass =
    className ?? "inline-flex flex-wrap items-center gap-2";

  return (
    <div className={wrapClass}>
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/85 transition hover:border-gold-400/60 hover:text-gold-200"
        aria-label="Share this product"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {shared ? "Shared" : "Share"}
      </button>

      <button
        type="button"
        onClick={copyUrl}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/70 transition hover:border-white/30 hover:text-white"
        aria-label="Copy product link"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
