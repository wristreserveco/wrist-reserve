"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useCart } from "@/components/providers/CartProvider";

export function Navbar() {
  const pathname = usePathname();
  const { count } = useCart();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) return null;

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-2 sm:gap-3 sm:px-6 lg:px-8">
        {/* Stacked wordmark — WRIST over RESERVE — in soft luxe gold.
         * Two lines on every breakpoint so the brand reads as a monogram
         * rather than a wide horizontal bar. Tight line-height keeps the
         * whole thing inside the h-16 header. */}
        <Link
          href="/"
          aria-label="Wrist Reserve home"
          className="text-center font-display text-lg leading-[0.95] tracking-[0.2em] text-gold-300 transition hover:text-gold-200 sm:text-2xl sm:leading-[0.85]"
        >
          <span className="block">WRIST</span>
          <span className="block">RESERVE</span>
        </Link>
        <nav className="flex items-center gap-3 text-xs font-medium tracking-wide text-white/80 sm:gap-8 sm:text-sm">
          {/* Shop is always a plain link — no hover dropdown. The full
           * catalog browsing happens on /shop itself.
           *
           * Extra right-margin on mobile only widens the Shop ↔ Word of
           * Mouth gap without also pushing the Cart pill off the right
           * edge (gap-3 still applies between Word of Mouth and Cart). */}
          <Link
            href="/shop"
            className={`relative mr-3 whitespace-nowrap transition hover:text-white sm:mr-0 ${
              pathname === "/shop" ? "text-white" : ""
            }`}
          >
            Shop
            {pathname === "/shop" ? (
              <span className="absolute -bottom-1 left-0 h-px w-full bg-gold-400" />
            ) : null}
          </Link>

          {/* Word of Mouth — off-platform social proof. Always visible
           * across every breakpoint (the brand mark + cart pill shrink on
           * mobile to make room). */}
          <Link
            href="/word-of-mouth"
            className={`relative whitespace-nowrap transition hover:text-white ${
              pathname === "/word-of-mouth" ? "text-white" : ""
            }`}
          >
            Word of Mouth
            {pathname === "/word-of-mouth" ? (
              <span className="absolute -bottom-1 left-0 h-px w-full bg-gold-400" />
            ) : null}
          </Link>

          <Link
            href="/cart"
            className="relative flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/90 transition hover:border-gold-500/40 hover:text-white sm:gap-2 sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.15em]"
          >
            Cart
            {count > 0 ? (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gold-500/20 px-1 text-[10px] text-gold-300">
                {count}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </motion.header>
  );
}
