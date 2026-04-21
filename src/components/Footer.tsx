"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-lg tracking-[0.25em] text-white">WRIST RESERVE</p>
          <p className="mt-2 max-w-xs text-sm text-white/45">
            Curated timepieces. Private sales. Discreet worldwide shipping.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm text-white/55">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">Explore</span>
          <Link href="/shop" className="transition hover:text-gold-300">
            Collection
          </Link>
          <Link href="/#featured" className="transition hover:text-gold-300">
            Featured
          </Link>
        </div>
        <div className="text-xs text-white/35">
          © {new Date().getFullYear()} Wrist Reserve. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
