"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import type { Category } from "@/lib/types";

const links = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
];

export function Navbar() {
  const pathname = usePathname();
  const { count } = useCart();
  const isAdmin = pathname?.startsWith("/admin");
  const [categories, setCategories] = useState<Category[]>([]);
  const [openShop, setOpenShop] = useState(false);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    fetch("/api/categories", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as Category[]) : []))
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (isAdmin) return null;

  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);
  const hasCategories = parents.length > 0;

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-xl tracking-[0.2em] text-white transition hover:text-gold-300"
        >
          WRIST RESERVE
        </Link>
        <nav className="flex items-center gap-8 text-sm font-medium tracking-wide text-white/80">
          <Link
            href="/"
            className={`relative transition hover:text-white ${
              pathname === "/" ? "text-white" : ""
            }`}
          >
            Home
            {pathname === "/" ? (
              <span className="absolute -bottom-1 left-0 h-px w-full bg-gold-400" />
            ) : null}
          </Link>

          {/* Shop with dropdown if categories exist */}
          {hasCategories ? (
            <div
              className="relative"
              onMouseEnter={() => setOpenShop(true)}
              onMouseLeave={() => setOpenShop(false)}
            >
              <Link
                href="/shop"
                className={`relative transition hover:text-white ${
                  pathname === "/shop" ? "text-white" : ""
                }`}
              >
                Shop
                {pathname === "/shop" ? (
                  <span className="absolute -bottom-1 left-0 h-px w-full bg-gold-400" />
                ) : null}
              </Link>
              <AnimatePresence>
                {openShop ? (
                  <motion.div
                    key="shop-menu"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16 }}
                    className="absolute left-1/2 top-full z-50 mt-3 min-w-[260px] -translate-x-1/2 rounded-sm border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl"
                  >
                    <Link
                      href="/shop"
                      className="block rounded-sm px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/70 hover:bg-white/5 hover:text-white"
                    >
                      Everything
                    </Link>
                    <div className="my-2 h-px bg-white/5" />
                    <ul className="space-y-1">
                      {parents.map((p) => {
                        const kids = childrenOf(p.id);
                        return (
                          <li key={p.id}>
                            <Link
                              href={`/shop?category=${p.slug}`}
                              className="block rounded-sm px-3 py-2 text-sm text-white hover:bg-white/5"
                            >
                              {p.name}
                            </Link>
                            {kids.length > 0 ? (
                              <ul className="ml-2 mt-0.5 space-y-0.5 border-l border-white/5 pl-3">
                                {kids.map((k) => (
                                  <li key={k.id}>
                                    <Link
                                      href={`/shop?category=${k.slug}`}
                                      className="block rounded-sm px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
                                    >
                                      {k.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            links
              .filter((l) => l.href !== "/")
              .map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`relative transition hover:text-white ${
                      active ? "text-white" : ""
                    }`}
                  >
                    {l.label}
                    {active ? (
                      <span className="absolute -bottom-1 left-0 h-px w-full bg-gold-400" />
                    ) : null}
                  </Link>
                );
              })
          )}

          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.15em] text-white/90 transition hover:border-gold-500/40 hover:text-white"
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
