"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice, parseMediaUrls } from "@/lib/products";

export default function CartPage() {
  const { lines, removeLine, clear } = useCart();

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl text-white">Your cart</h1>
        <p className="mt-4 text-sm text-white/50">No pieces selected yet.</p>
        <Link
          href="/shop"
          className="mt-10 inline-flex rounded-sm border border-white/15 px-8 py-3 text-xs uppercase tracking-[0.25em] text-white transition hover:border-gold-500/40 hover:text-gold-100"
        >
          Browse collection
        </Link>
      </div>
    );
  }

  const total = lines.reduce((acc, l) => acc + l.product.price * l.quantity, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/35">Cart</p>
          <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">Selected pieces</h1>
        </div>
        <button
          type="button"
          onClick={clear}
          className="self-start text-xs uppercase tracking-[0.2em] text-white/40 transition hover:text-white"
        >
          Clear cart
        </button>
      </div>

      <ul className="mt-12 space-y-8">
        {lines.map((line) => {
          const img = parseMediaUrls(line.product.media_urls)[0];
          return (
            <motion.li
              key={line.product.id}
              layout
              className="flex gap-6 border-b border-white/10 pb-8"
            >
              <Link href={`/products/${line.product.id}`} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-zinc-950">
                {img ? (
                  <Image
                    src={img}
                    alt={line.product.name}
                    fill
                    className="object-cover"
                    sizes="96px"
                    unoptimized={img.includes("unsplash")}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-white/30">
                    —
                  </div>
                )}
              </Link>
              <div className="flex flex-1 flex-col justify-between sm:flex-row sm:items-center">
                <div>
                  <Link
                    href={`/products/${line.product.id}`}
                    className="font-display text-lg text-white transition hover:text-gold-200"
                  >
                    {line.product.name}
                  </Link>
                  <p className="mt-1 text-xs text-white/40">Qty {line.quantity}</p>
                </div>
                <div className="mt-4 flex items-center gap-6 sm:mt-0">
                  <p className="text-sm text-white/80">{formatPrice(line.product.price * line.quantity)}</p>
                  <button
                    type="button"
                    onClick={() => removeLine(line.product.id)}
                    className="text-xs uppercase tracking-[0.15em] text-white/35 transition hover:text-red-400/90"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-10 flex flex-col items-end gap-4 border-t border-white/10 pt-10">
        <p className="text-sm text-white/50">
          Subtotal <span className="ml-4 font-display text-2xl text-white">{formatPrice(total)}</span>
        </p>
        <p className="max-w-md text-right text-xs text-white/35">
          Checkout is per piece. Open a product and use Buy Now for Stripe Checkout.
        </p>
        <Link
          href="/shop"
          className="rounded-sm bg-white px-8 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
