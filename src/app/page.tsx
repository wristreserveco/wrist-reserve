import Link from "next/link";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ProductGrid } from "@/components/ProductGrid";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { buildCategorySlides, type HeroCategorySlide } from "@/lib/categories";
import { mapCategory, mapHeroSlide, mapProduct } from "@/lib/products";
import type { Category, HeroSlide, Product } from "@/lib/types";
import { TIER_META } from "@/lib/tiers";

export const dynamic = "force-dynamic";

async function loadHomeData(): Promise<{
  heroSlides: HeroCategorySlide[];
  adminHeroSlides: HeroSlide[];
  tierSpotlight: HeroSlide;
  featured: Product[];
  sold: Product[];
  parentCategories: Category[];
  superTierSpotlight: Product[];
  configured: boolean;
}> {
  const superTierMeta = TIER_META.super_tier;
  const fallbackTierSpotlight: HeroSlide = {
    id: "tier-spotlight-super_tier",
    title: superTierMeta.plural,
    tagline: superTierMeta.blurb,
    image_url: null,
    video_url: null,
    cta_label: `Enter the ${superTierMeta.label}`,
    cta_href: "/shop?tier=super_tier",
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    return {
      heroSlides: buildCategorySlides([]),
      adminHeroSlides: [],
      tierSpotlight: fallbackTierSpotlight,
      featured: [],
      sold: [],
      parentCategories: [],
      superTierSpotlight: [],
      configured: false,
    };
  }

  const supabase = await createClient();

  const [{ data: allRows }, { data: catRows }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const allProducts = (allRows ?? []).map((row) =>
    mapProduct(row as Record<string, unknown>)
  );
  const categories: Category[] = (catRows ?? []).map((row) =>
    mapCategory(row as Record<string, unknown>)
  );
  // Only surface brands that actually have inventory you can buy right now.
  // A product counts if it's linked (directly or via a sub-category) to the
  // brand and still listed as available. Sold-out-only brands get hidden so
  // the collections grid never leads buyers to an empty shelf.
  const liveCategoryIds = new Set<string>();
  for (const product of allProducts) {
    if (product.status === "sold") continue;
    if (!product.category_id) continue;
    liveCategoryIds.add(product.category_id);
  }
  const brandsWithInventory = new Set<string>();
  for (const cat of categories) {
    if (!liveCategoryIds.has(cat.id)) continue;
    // If the hit is a sub-category, promote to its parent brand.
    const brandId = cat.parent_id ?? cat.id;
    brandsWithInventory.add(brandId);
  }
  const parentCategories = categories
    .filter(
      (c) => !c.parent_id && c.image_url && brandsWithInventory.has(c.id),
    )
    .slice(0, 8);

  // hero_slides table is added in migration 007 — tolerate it not existing yet.
  let adminHeroSlides: HeroSlide[] = [];
  try {
    const { data: heroRows, error: heroErr } = await supabase
      .from("hero_slides")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (!heroErr && heroRows) {
      adminHeroSlides = heroRows.map((r) =>
        mapHeroSlide(r as Record<string, unknown>)
      );
    }
  } catch {
    // Table not present yet — silently fall back to category-built slides.
  }

  const featured = allProducts.filter((p) => p.featured).slice(0, 12);
  // “Already on wrists” — only sold pieces you’ve left in the spotlight in admin.
  const sold = allProducts
    .filter((p) => p.status === "sold" && p.on_wrist_spotlight !== false)
    .slice(0, 6);
  const superTierSpotlight = allProducts
    .filter((p) => p.tier === "super_tier" && p.status !== "sold")
    .slice(0, 4);
  const heroSlides = buildCategorySlides(allProducts);

  // Super Tier hero slide — always present so the tier gets top-of-funnel
  // exposure regardless of current inventory. If we have super_tier pieces
  // we borrow the first one's cover art; otherwise we fall back to the
  // newest featured (or newest overall) product so the slide never looks
  // empty.
  const heroImage =
    superTierSpotlight[0]?.media_urls?.[0] ??
    featured[0]?.media_urls?.[0] ??
    allProducts[0]?.media_urls?.[0] ??
    null;
  const tierSpotlight: HeroSlide = {
    ...fallbackTierSpotlight,
    image_url: heroImage,
  };

  return {
    heroSlides,
    adminHeroSlides,
    tierSpotlight,
    featured,
    sold,
    parentCategories,
    superTierSpotlight,
    configured: true,
  };
}

export default async function HomePage() {
  const {
    heroSlides,
    adminHeroSlides,
    tierSpotlight,
    featured,
    sold,
    parentCategories,
    superTierSpotlight,
    configured,
  } = await loadHomeData();
  const superTierMeta = TIER_META.super_tier;

  return (
    <div>
      <HeroCarousel
        slides={heroSlides}
        adminSlides={adminHeroSlides}
        tierSpotlight={tierSpotlight}
      />

      {parentCategories.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-gold-400/90">
                Shop by collection
              </p>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
                Find your piece
              </h2>
            </div>
            <Link
              href="/shop"
              className="hidden text-xs uppercase tracking-[0.25em] text-white/55 transition hover:text-gold-200 sm:block"
            >
              All collections →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {parentCategories.map((c) => (
              <Link
                key={c.id}
                href={`/shop?category=${c.slug}`}
                className="group relative block aspect-[4/5] overflow-hidden rounded-sm border border-white/10 bg-zinc-950"
              >
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.image_url}
                    alt={c.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="font-display text-xl text-white">{c.name}</p>
                  {c.tagline ? (
                    <p className="mt-1 text-xs text-white/60">{c.tagline}</p>
                  ) : null}
                  <p className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-gold-300">
                    Explore →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="featured" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold-400/90">Featured</p>
            <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">Selected pieces</h2>
            <p className="mt-3 max-w-lg text-sm text-white/50">
              Hand-picked, on the bench, ready to ship worldwide.
            </p>
          </div>
          <Link
            href="/shop"
            className="text-xs uppercase tracking-[0.25em] text-white/55 transition hover:text-gold-200"
          >
            View collection →
          </Link>
        </div>
        {!configured ? (
          <p className="mt-10 rounded-sm border border-gold-500/20 bg-gold-500/5 px-4 py-3 text-sm text-gold-200/90">
            Connect Supabase (see <code className="text-gold-100">.env.example</code>) to load live
            inventory.
          </p>
        ) : null}
        <div className="mt-14">
          <ProductGrid products={featured} />
        </div>
      </section>

      {/* Super Tier editorial — positioned after Featured so buyers see the
          working catalog first, then the aspirational step-up. Always rendered
          so the tier has a permanent funnel even when we're between drops. */}
      <section className="relative overflow-hidden border-y border-gold-500/15 bg-gradient-to-br from-black via-zinc-950 to-black">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.10),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.05),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-end">
            <div>
              <p className="text-[11px] uppercase tracking-[0.42em] text-gold-300">
                {superTierMeta.label} · By invitation
              </p>
              <h2 className="mt-4 font-display text-4xl leading-[1.05] text-white sm:text-5xl">
                {superTierMeta.tagline}
              </h2>
              <p className="mt-6 max-w-xl text-base text-white/70">
                {superTierMeta.blurb}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/shop?tier=super_tier"
                  className="inline-flex w-fit items-center gap-2 rounded-sm bg-gold-400 px-7 py-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-black transition hover:bg-gold-300"
                >
                  Enter the {superTierMeta.label} →
                </Link>
                <Link
                  href="/shop"
                  className="text-[11px] uppercase tracking-[0.25em] text-white/50 transition hover:text-gold-200"
                >
                  Full catalog →
                </Link>
              </div>
            </div>

            <dl className="grid gap-6 sm:grid-cols-3 lg:border-l lg:border-gold-500/10 lg:pl-10">
              {[
                {
                  kicker: "01",
                  title: "Indistinguishable",
                  body:
                    "Weight, balance, hand-feel — engineered to feel identical to the reference on-wrist.",
                },
                {
                  kicker: "02",
                  title: "Tolerance zero",
                  body:
                    "Dial alignment, lume tone, bezel action — every detail examined before it earns the tier.",
                },
                {
                  kicker: "03",
                  title: "Hand-inspected",
                  body:
                    "Each piece leaves our bench individually authenticated, documented, and signed off.",
                },
              ].map((pillar) => (
                <div key={pillar.kicker} className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-gold-300/80">
                    {pillar.kicker}
                  </p>
                  <dt className="font-display text-lg text-white">{pillar.title}</dt>
                  <dd className="text-sm leading-relaxed text-white/55">
                    {pillar.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {superTierSpotlight.length > 0 ? (
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {superTierSpotlight.map((p) => {
                const cover =
                  Array.isArray(p.media_urls) && p.media_urls.length > 0
                    ? p.media_urls[0]
                    : null;
                return (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="group relative block aspect-[4/5] overflow-hidden rounded-sm border border-gold-500/15 bg-black"
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={p.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <span className="absolute left-3 top-3 rounded-full border border-gold-400/70 bg-gold-400/15 px-3 py-1 text-[9px] uppercase tracking-[0.25em] text-gold-100 backdrop-blur">
                      {superTierMeta.label}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      {p.brand ? (
                        <p className="text-[10px] uppercase tracking-[0.25em] text-white/55">
                          {p.brand}
                        </p>
                      ) : null}
                      <p className="mt-1 font-display text-lg text-white">
                        {p.name}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-t border-white/5 bg-zinc-950/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/35">Recently shipped</p>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">Already on wrists</h2>
              <p className="mt-3 max-w-lg text-sm text-white/45">
                Pieces that just left the bench, worldwide. If you see something you liked, hit the chat — we restock quietly.
              </p>
            </div>
          </div>
          <div className="mt-14">
            <ProductGrid products={sold} />
          </div>
        </div>
      </section>
    </div>
  );
}
