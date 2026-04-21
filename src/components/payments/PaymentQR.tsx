"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  /** A URL (e.g. Cash App deep link) to encode as a QR. */
  value?: string | null;
  /**
   * An external QR image (e.g. Zelle QR exported from your bank app) that
   * supersedes auto-generated QRs. Shown as-is.
   */
  imageUrl?: string | null;
  caption?: string;
  size?: number;
}

export function PaymentQR({ value, imageUrl, caption, size = 180 }: Props) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setZoom(false);
      }
    };
    // Capture phase so we run before any outer modal's Escape handler.
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoom]);

  if (!imageUrl && !value) return null;

  const renderQr = (px: number) =>
    imageUrl ? (
      <Image
        src={imageUrl}
        alt={caption ?? "Payment QR"}
        width={px}
        height={px}
        unoptimized
        className="block"
      />
    ) : value ? (
      <QRCodeSVG value={value} size={px} level="M" includeMargin={false} />
    ) : null;

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="group relative rounded-sm bg-white p-3 transition hover:ring-2 hover:ring-gold-400/60"
          aria-label="Enlarge QR code"
        >
          {renderQr(size)}
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/85 text-white shadow-lg shadow-black/30 transition group-hover:scale-110">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </span>
        </button>
        {caption ? (
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">
            {caption}
          </p>
        ) : null}
      </div>

      <AnimatePresence>
        {zoom ? (
          <motion.div
            key="qr-zoom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
            onClick={() => setZoom(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-md bg-white p-5 shadow-2xl">
                {renderQr(Math.min(420, typeof window !== "undefined" ? window.innerWidth - 80 : 420))}
              </div>
              {caption ? (
                <p className="text-xs uppercase tracking-[0.25em] text-white/70">
                  {caption}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setZoom(false)}
                className="mt-2 rounded-full border border-white/25 px-5 py-2 text-[10px] uppercase tracking-[0.25em] text-white/80 transition hover:border-white hover:text-white"
              >
                Close
              </button>
            </motion.div>
            <button
              type="button"
              onClick={() => setZoom(false)}
              aria-label="Close enlarged QR"
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-white hover:text-white"
            >
              ×
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
