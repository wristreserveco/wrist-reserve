"use client";

import { useState } from "react";

export function CopyButtonClient({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API blocked — fall back silently.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 rounded-sm border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/50 transition hover:border-white/30 hover:text-white"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
