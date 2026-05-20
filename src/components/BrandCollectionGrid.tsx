import Image from "next/image";
import Link from "next/link";
import type { BrandCollectionCard } from "@/lib/collections";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

/** Stacked brand tiles — few collections, no horizontal scroll. */
export function BrandCollectionGrid({ cards }: { cards: BrandCollectionCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link
          key={c.id}
          href={c.shopHref}
          className="group relative block aspect-[4/5] overflow-hidden rounded-sm border border-white/10 bg-zinc-950"
        >
          <div className="absolute inset-0">
          <Image
            src={c.coverImage}
            alt={c.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-700 group-hover:scale-[1.04]"
            placeholder="blur"
            blurDataURL={LUXE_BLUR_DATA_URL}
            unoptimized={shouldUnoptimize(c.coverImage)}
          />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="font-display text-xl text-white">{c.name}</p>
            {c.tagline ? (
              <p className="mt-1 text-xs text-white/60">{c.tagline}</p>
            ) : null}
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
              {c.pieceCount === 1 ? "1 piece in stock" : `${c.pieceCount} pieces in stock`}
            </p>
            <p className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-gold-300 transition group-hover:text-gold-100">
              Explore →
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
