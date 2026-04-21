"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type LightboxMedia = {
  url: string;
  type: "image" | "video";
  alt?: string;
};

interface Props {
  media: LightboxMedia | null;
  onClose: () => void;
}

export function MediaLightbox({ media, onClose }: Props) {
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [media, onClose]);

  return (
    <AnimatePresence>
      {media ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white backdrop-blur transition hover:bg-white/20"
          >
            Close
          </button>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw]"
          >
            {media.type === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={media.url}
                alt={media.alt ?? ""}
                className="max-h-[90vh] max-w-[90vw] rounded-sm object-contain"
              />
            ) : (
              <video
                src={media.url}
                controls
                autoPlay
                playsInline
                className="max-h-[90vh] max-w-[90vw] rounded-sm"
              />
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
