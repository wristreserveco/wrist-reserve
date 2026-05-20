"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Product } from "@/lib/types";
import { formatPrice, parseMediaUrls } from "@/lib/products";
import { TIER_META } from "@/lib/tiers";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";
import { useCanAutoplay } from "@/lib/media/playback-policy";

interface ProductCardProps {
  product: Product;
  index?: number;
  /** Override Next/Image `sizes` — use fixed width in horizontal carousels. */
  imageSizes?: string;
}

/**
 * Product card with bandwidth-conscious, video-on-hover cover.
 *
 * Previous version autoplayed every card video as it entered the viewport,
 * which was burning Supabase Storage egress at >2× the free-plan cap. The
 * pattern now matches Hodinkee / Crown & Caliber / Bezel:
 *
 *   - Mobile / touch:    poster image only, "▶ Video" badge hints at video.
 *                        Buyer taps through to the product page to watch.
 *   - Desktop / mouse:   poster image only by default. On hover, the video
 *                        element mounts AND starts playing — zero bytes
 *                        until intent is shown.
 *   - Data-saver / 2-3G: video never autoplays anywhere.
 *
 * Result: ~0 bytes per card on first paint, vs ~5MB previously.
 */
export function ProductCard({
  product,
  index = 0,
  imageSizes = "(max-width: 768px) 100vw, 33vw",
}: ProductCardProps) {
  const images = parseMediaUrls(product.media_urls);
  const cover = images[0];
  const sold = product.status === "sold";
  const hasVideo = Boolean(product.video_url);
  const poster = cover ?? product.video_poster_url ?? null;

  const router = useRouter();
  const href = `/products/${product.id}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const canAutoplay = useCanAutoplay();
  const prefetchedRef = useRef(false);

  // Only attach the <video> element when the user hovers AND the device
  // is allowed to autoplay (desktop pointer, no Save-Data, not on 2G/3G).
  const showVideoLayer = hasVideo && canAutoplay && hovered;

  // Prefetch the detail route on first hover/touch. Next.js already
  // prefetches links in the viewport; this just makes the *navigation* feel
  // instant when the user actually moves toward a card. Idempotent — we
  // remember whether we've prefetched so we don't re-fire on every mouse
  // wiggle.
  function prefetchOnce() {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    try {
      router.prefetch(href);
    } catch {
      /* router.prefetch is sync but guard anyway */
    }
  }

  // Respect trim window if the admin set one. Re-applies whenever the
  // video layer mounts (i.e. fresh hover).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const start = Math.max(0, product.video_trim_start ?? 0);
    const end = product.video_trim_end ?? null;
    if (start > 0) {
      try {
        v.currentTime = start;
      } catch {
        /* noop */
      }
    }
    const onTime = () => {
      if (end && v.currentTime >= end - 0.05) v.currentTime = start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [
    product.video_url,
    product.video_trim_start,
    product.video_trim_end,
    showVideoLayer,
  ]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="group relative"
      onMouseEnter={() => {
        prefetchOnce();
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={prefetchOnce}
      onFocus={() => {
        prefetchOnce();
        setHovered(true);
      }}
      onBlur={() => setHovered(false)}
    >
      <Link href={href} prefetch className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-white/5 bg-zinc-950">
          {/* Poster / cover — always painted first so the card never flashes blank.
              Three-tier fallback so a card NEVER renders as a black box:
                1. A real image (poster_url or first media_url) — best.
                2. The video itself, seeked to ~0.5s with preload=metadata —
                   browsers paint that frame as a static thumbnail. Costs ~50 KB
                   of metadata, not the whole video, so it's bandwidth-safe on
                   mobile and data-saver.
                3. "No media" label — only if neither image nor video exists. */}
          {poster ? (
            <Image
              src={poster}
              alt={product.name}
              fill
              priority={index < 3}
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
              sizes={imageSizes}
              placeholder="blur"
              blurDataURL={LUXE_BLUR_DATA_URL}
              unoptimized={shouldUnoptimize(poster)}
            />
          ) : hasVideo ? (
            <video
              src={`${product.video_url}#t=0.5`}
              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-zinc-900 text-xs text-white/30">
              No media
            </div>
          )}

          {/* Video layer mounts only on hover (desktop with mouse) and
              never on touch / data-saver devices. Zero bytes until intent. */}
          {showVideoLayer ? (
            <video
              ref={videoRef}
              src={product.video_url ?? undefined}
              poster={poster ?? undefined}
              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
              muted
              loop
              playsInline
              autoPlay
              preload="none"
              aria-hidden="true"
            />
          ) : null}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 transition group-hover:opacity-100" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {sold ? (
              <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 backdrop-blur">
                Sold Out
              </span>
            ) : (
              <span className="rounded-full border border-gold-500/30 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold-200 backdrop-blur">
                Available
              </span>
            )}
          </div>
          {hasVideo ? (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              ▶ Video
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            {product.brand || product.tier === "super_tier" ? (
              <p className="text-[10px] uppercase tracking-[0.25em]">
                {product.tier === "super_tier" ? (
                  <>
                    <span className="text-gold-200/90">{TIER_META.super_tier.label}</span>
                    {product.brand ? (
                      <>
                        <span className="text-white/25"> · </span>
                        <span className="text-white/40">{product.brand}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="text-white/40">{product.brand}</span>
                )}
              </p>
            ) : null}
            <h3 className="font-display text-lg text-white transition group-hover:text-gold-200">
              {product.name}
            </h3>
          </div>
          <p className="shrink-0 text-sm text-white/90">{formatPrice(product.price)}</p>
        </div>
      </Link>
    </motion.article>
  );
}
