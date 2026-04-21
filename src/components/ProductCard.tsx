"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Product } from "@/lib/types";
import { formatPrice, parseMediaUrls } from "@/lib/products";
import { TIER_META } from "@/lib/tiers";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const images = parseMediaUrls(product.media_urls);
  const cover = images[0];
  const sold = product.status === "sold";
  const videoRef = useRef<HTMLVideoElement>(null);

  // Loop only within trim window if set, otherwise loop full video.
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
  }, [product.video_url, product.video_trim_start, product.video_trim_end]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="group relative"
    >
      <Link href={`/products/${product.id}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-white/5 bg-zinc-950">
          {product.video_url ? (
            <video
              ref={videoRef}
              src={product.video_url}
              poster={product.video_poster_url ?? cover}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : cover ? (
            <Image
              src={cover}
              alt={product.name}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, 33vw"
              unoptimized={cover.includes("unsplash")}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-zinc-900 text-xs text-white/30">
              No media
            </div>
          )}
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
            {product.tier === "super_tier" ? (
              <span className="rounded-full border border-gold-400/70 bg-gold-400/15 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-gold-100 backdrop-blur">
                {TIER_META.super_tier.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            {product.brand ? (
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">{product.brand}</p>
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
