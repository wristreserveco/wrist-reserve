import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid } from "@/components/ProductGrid";
import { ShopFilters } from "@/components/ShopFilters";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  getRootCategory,
  mapCategory,
  mapProduct,
  productIsShopBuyable,
  productShopBrandLabel,
  resolveCategoryBySlug,
} from "@/lib/products";
import type { Category, Product } from "@/lib/types";
import { PRODUCT_TIERS, TIER_META, type ProductTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";

function parseParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

async function ShopContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const brand = parseParam(searchParams.brand);
  const min = parseParam(searchParams.min);
  const max = parseParam(searchParams.max);
  const q = parseParam(searchParams.q).toLowerCase().trim();
  const categorySlug = parseParam(searchParams.category).trim();
  // Normalise the tier URL param. Accepts `super_tier` (canonical) and
  // `reserve` (legacy — kept working so old share links don't break).
  const rawTierSlug = parseParam(searchParams.tier).trim().toLowerCase();
  const tierSlug = rawTierSlug === "reserve" ? "super_tier" : rawTierSlug;
  /** Full grid (classic + super). Rare; set from the shop filter link. */
  const showAllTiers = tierSlug === "all";
  const activeTier: ProductTier | null = showAllTiers
    ? null
    : !tierSlug
      ? null
      : PRODUCT_TIERS.includes(tierSlug as ProductTier)
        ? (tierSlug as ProductTier)
        : null;

  // `sort` is driven by the filter UI (newest first by default).
  const sortParam = parseParam(searchParams.sort).trim().toLowerCase();

  let products: Product[] = [];
  let brands: string[] = [];
  let categories: Category[] = [];
  let activeCategory: Category | null = null;
  let childCategories: Category[] = [];
  let parentCategory: Category | null = null;
  // Pre-filter snapshot of inventory, used to compute which categories
  // currently have live stock. We capture this BEFORE the filter block below
  // narrows `products` by the active filters, otherwise the Collections chip
  // row would collapse to just the brand you're already on.
  let allProductsBeforeFilter: Product[] = [];
  /** Category rows (leaf or any depth) that have ≥1 buyable product — shared by filters + chips. */
  let liveBuyableCategoryIds: string[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data: prodRows }, { data: catRows }] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .or("hidden.is.null,hidden.eq.false")
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    products = (prodRows ?? []).map((row) =>
      mapProduct(row as Record<string, unknown>)
    );
    allProductsBeforeFilter = products;
    categories = (catRows ?? []).map((row) =>
      mapCategory(row as Record<string, unknown>)
    );

    const buyableCategoryIds = new Set(
      allProductsBeforeFilter
        .filter((p) => productIsShopBuyable(p) && p.category_id)
        .map((p) => p.category_id as string),
    );
    liveBuyableCategoryIds = Array.from(buyableCategoryIds);

    // Brand dropdown: only brands (root categories) that currently have
    // buyable inventory under them — never advertise Richard Mille when
    // every RM piece is sold or you never stocked one.
    const parentNames = categories
      .filter((c) => !c.parent_id)
      .map((c) => c.name.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (parentNames.length > 0) {
      const rootsWithStock = new Set<string>();
      for (const p of allProductsBeforeFilter) {
        if (!productIsShopBuyable(p) || !p.category_id) continue;
        const root = getRootCategory(categories, p.category_id);
        if (root?.name?.trim()) rootsWithStock.add(root.name.trim());
      }
      brands = parentNames.filter((n) => rootsWithStock.has(n));
    } else {
      const brandSet = new Set<string>();
      allProductsBeforeFilter.forEach((p) => {
        if (!productIsShopBuyable(p)) return;
        const label = productShopBrandLabel(p, categories);
        if (label) brandSet.add(label);
      });
      brands = Array.from(brandSet).sort((a, b) => a.localeCompare(b));
    }

    // Category filtering — include all descendants of the selected slug.
    let includeIds: Set<string> | null = null;
    if (categorySlug) {
      const resolved = resolveCategoryBySlug(categories, categorySlug);
      if (resolved) {
        activeCategory = resolved.category;
        includeIds = new Set(resolved.ids);
        childCategories = categories.filter(
          (c) => c.parent_id === resolved.category.id
        );
        parentCategory = resolved.category.parent_id
          ? categories.find((c) => c.id === resolved.category.parent_id) ?? null
          : null;
      }
    }

    products = products.filter((p) => {
      if (includeIds && (!p.category_id || !includeIds.has(p.category_id))) {
        return false;
      }
      if (showAllTiers) {
        // explicit ?tier=all — no tier-based exclusion
      } else if (activeTier) {
        if (p.tier !== activeTier) return false;
      } else {
        // Default shop view: main catalog only (Super Tier is opt-in via toggle).
        if (p.tier === "super_tier") return false;
      }
      if (brand) {
        const label = productShopBrandLabel(p, categories);
        if (
          !label ||
          label.toLowerCase() !== brand.toLowerCase()
        ) {
          return false;
        }
      }
      if (min && p.price < Number(min)) return false;
      if (max && p.price > Number(max)) return false;
      if (q) {
        const hay = `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Apply sort client-side since we've already filtered in memory and the
    // catalog is small. This keeps Supabase queries cacheable.
    switch (sortParam) {
      case "price-asc":
        products.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        products.sort((a, b) => b.price - a.price);
        break;
      case "featured":
        products.sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return 0;
        });
        break;
      // "newest" / default: DB already returned created_at DESC.
      default:
        break;
    }
  }

  // Sub-category pills: only lines/models with buyable inventory right now.
  const buyableSet = new Set(liveBuyableCategoryIds);
  const chipCategoriesRaw: Category[] = activeCategory
    ? childCategories.length > 0
      ? childCategories
      : parentCategory
        ? categories.filter((c) => c.parent_id === parentCategory!.id)
        : []
    : [];
  const chipCategories: Category[] = activeCategory
    ? chipCategoriesRaw.filter(
        (c) => buyableSet.has(c.id) || c.id === activeCategory.id,
      )
    : [];

  // Only show a landing banner for publicly-advertised tiers when that tier
  // filter is active (not for ?tier=all).
  const tierMeta =
    activeTier && TIER_META[activeTier].publiclyAdvertised
      ? TIER_META[activeTier]
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:py-16 lg:px-8">
      {tierMeta ? (
        <div className="mb-5 rounded-sm border border-gold-400/30 bg-gradient-to-r from-gold-500/10 via-black to-black px-4 py-4 sm:mb-10 sm:px-10 sm:py-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold-300">
            {tierMeta.label}
          </p>
          <h1 className="mt-1 font-display text-2xl text-white sm:mt-2 sm:text-4xl">
            {tierMeta.plural}
          </h1>
          <p className="mt-2 text-xs leading-snug text-white/60 md:hidden">
            {tierMeta.tagline}
          </p>
          <p className="mt-3 hidden max-w-2xl text-sm text-white/60 md:block">
            {tierMeta.blurb}
          </p>
        </div>
      ) : null}

      {activeCategory ? (
        <nav className="mb-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/40">
          <Link href="/shop" className="hover:text-white">
            Shop
          </Link>
          {parentCategory ? (
            <>
              <span>›</span>
              <Link
                href={`/shop?category=${parentCategory.slug}`}
                className="hover:text-white"
              >
                {parentCategory.name}
              </Link>
            </>
          ) : null}
          <span>›</span>
          <span className="text-white">{activeCategory.name}</span>
        </nav>
      ) : null}

      <Suspense fallback={<div className="h-24 animate-pulse rounded-sm bg-white/5" />}>
        <ShopFilters
          brands={brands}
          categories={categories}
          activeTier={activeTier}
          liveCategoryIds={liveBuyableCategoryIds}
        />
      </Suspense>

      {activeCategory && chipCategories.length > 0 ? (
        <div className="mb-10 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] uppercase tracking-[0.25em] text-white/35">
            {childCategories.length > 0 ? "Sub-categories" : "Also in"}
          </span>
          <Link
            href={
              parentCategory
                ? `/shop?category=${parentCategory.slug}`
                : `/shop?category=${activeCategory.slug}`
            }
            className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
              childCategories.length > 0
                ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
                : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
            }`}
          >
            All {parentCategory?.name ?? activeCategory.name}
          </Link>
          {chipCategories.map((c) => {
            const active = c.id === activeCategory.id;
            return (
              <Link
                key={c.id}
                href={`/shop?category=${c.slug}`}
                className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
                  active
                    ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
                    : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {!isSupabaseConfigured() ? (
        <p className="mb-10 rounded-sm border border-white/10 px-4 py-3 text-sm text-white/50">
          Configure Supabase environment variables to load inventory.
        </p>
      ) : null}
      <ProductGrid products={products} />
    </div>
  );
}

export default function ShopPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <Suspense fallback={<div className="min-h-[40vh] bg-black" />}>
      <ShopContent searchParams={searchParams} />
    </Suspense>
  );
}
