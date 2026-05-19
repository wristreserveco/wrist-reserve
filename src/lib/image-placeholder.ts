/**
 * Site-wide low-quality image placeholder (LQIP).
 *
 * A single tiny SVG (8 × 10) encoded as a data: URI. Used as the default
 * `placeholder="blur"` for every <Image /> until / unless a real per-image
 * blurDataURL is generated at upload time.
 *
 * Why share one blur instead of generating per-image:
 *   1. Per-image blur (ThumbHash, BlurHash) would require either a one-time
 *      backfill of every existing product image OR a server-side fetch +
 *      decode on every page load. Both are heavy for the perceived gain.
 *   2. A shared dark luxe-toned blur is what Apple and Tiffany use as the
 *      default. It looks intentional, never wrong.
 *   3. Adding this is purely additive — Next.js only renders the placeholder
 *      while the real image is still loading, then crossfades automatically.
 *
 * If we ever want true per-image blur, we add a `thumb_hash` column to
 * `products`, generate it on upload, and prefer it when available — falling
 * back to this constant. Zero invasive changes to consumer components.
 */

/* A vertically-oriented dark gradient — black → zinc-900 → black, with a
 * subtle warm midpoint that hints at gold under low light. Sized 8x10 so it
 * stretches gracefully across both 4:5 product cards and wide hero crops. */
export const LUXE_BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10" viewBox="0 0 8 10">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0a0a0a"/>
          <stop offset="55%" stop-color="#1a1614"/>
          <stop offset="100%" stop-color="#050505"/>
        </linearGradient>
      </defs>
      <rect width="8" height="10" fill="url(#g)"/>
    </svg>`
  );

/**
 * Whether a remote URL can be optimized by next/image. Some legacy product
 * photos sit on hosts (Wikimedia, Unsplash) that we explicitly bypass to
 * avoid 4xx from the Next image proxy.
 */
export function shouldUnoptimize(url: string): boolean {
  return (
    url.includes("unsplash") ||
    url.includes("wikimedia.org") ||
    url.startsWith("data:")
  );
}
