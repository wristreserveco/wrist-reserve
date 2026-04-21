"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import type { Category } from "@/lib/types";
import { WATCH_CATEGORIES } from "@/lib/categories";
import { PUBLIC_TIERS, TIER_META, type ProductTier } from "@/lib/tiers";

export type SortKey =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "featured";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low → high" },
  { value: "price-desc", label: "Price: high → low" },
  { value: "featured", label: "Featured first" },
];

interface ShopFiltersProps {
  brands: string[];
  /**
   * Kept for backward-compat in case any callers still pass them, but no
   * longer rendered — preset price bands replaced the free-text inputs.
   */
  minPrice?: number;
  maxPrice?: number;
  categories?: Category[];
  activeTier?: ProductTier | null;
  /**
   * Category IDs (top-level brand AND sub-category) that currently have live
   * inventory. When provided, the Collections chip row is filtered to only
   * brands with something in stock — keeps the UI honest and prevents buyers
   * from clicking into empty shelves. If omitted, every top-level category
   * in the DB is shown (legacy behaviour).
   */
  liveCategoryIds?: string[];
}

export function ShopFilters({
  brands,
  categories = [],
  activeTier = null,
  liveCategoryIds,
}: ShopFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const brand = searchParams.get("brand") ?? "";
  const q = searchParams.get("q") ?? "";
  const categorySlug = searchParams.get("category") ?? "";
  const sort = (searchParams.get("sort") as SortKey | null) ?? "newest";
  const stock = searchParams.get("stock") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Clear stale category if a free-text search is set, and vice-versa —
      // they do similar things and double-filtering is confusing.
      if (key === "q" && value) next.delete("category");
      if (key === "category" && value) next.delete("q");
      startTransition(() => {
        router.push(`/shop?${next.toString()}`);
      });
    },
    [router, searchParams]
  );

  // Top-level categories from the DB (what the admin manages). If none exist
  // yet we fall back to the static WATCH_CATEGORIES so the page still works.
  // We also drop any brand that has zero live inventory so the chip row never
  // invites buyers into an empty shelf.
  const topCategories = useMemo(() => {
    const tops = categories.filter((c) => !c.parent_id);
    if (!liveCategoryIds) return tops;
    const liveSet = new Set(liveCategoryIds);
    // A brand counts if the brand row itself has stock, or any of its
    // sub-categories do.
    const brandsWithStock = new Set<string>();
    for (const cat of categories) {
      if (!liveSet.has(cat.id)) continue;
      brandsWithStock.add(cat.parent_id ?? cat.id);
    }
    // Always keep the currently-selected category in the row so the active
    // chip never disappears mid-browse (even if its last piece just sold).
    const selected = categorySlug
      ? tops.find((c) => c.slug === categorySlug)
      : null;
    return tops.filter(
      (c) => brandsWithStock.has(c.id) || (selected && c.id === selected.id),
    );
  }, [categories, liveCategoryIds, categorySlug]);
  const usingDbCategories = topCategories.length > 0;

  return (
    <div className="mb-12 border-b border-white/10 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/35">Refine</p>
          <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">
            The Collection
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.15em] text-white/40">
            Brand
            <select
              value={brand}
              disabled={pending}
              onChange={(e) => setParam("brand", e.target.value)}
              className="min-w-[160px] rounded-sm border border-white/10 bg-black px-3 py-2 text-sm font-normal normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.15em] text-white/40">
            Sort by
            <select
              value={sort}
              disabled={pending}
              onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="min-w-[180px] rounded-sm border border-white/10 bg-black px-3 py-2 text-sm font-normal normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 pb-[0.6rem] text-xs uppercase tracking-[0.15em] text-white/55">
            <input
              type="checkbox"
              checked={stock === "available"}
              disabled={pending}
              onChange={(e) =>
                setParam("stock", e.target.checked ? "available" : "")
              }
              className="h-4 w-4 accent-gold-400"
            />
            Hide sold out
          </label>
        </div>
      </div>

      {/* Tier toggle — one switch per publicly-advertised tier. Styled as a
          premium light-switch so there's zero ambiguity about tap-to-filter
          vs tap-to-clear, even for buyers who aren't used to filter chips. */}
      {PUBLIC_TIERS.length > 0 ? (
        <div className="mt-8 space-y-3">
          {PUBLIC_TIERS.map((tierKey) => {
            const active = activeTier === tierKey;
            const meta = TIER_META[tierKey];
            return (
              <label
                key={tierKey}
                className={`group flex cursor-pointer select-none items-center justify-between gap-4 rounded-sm border px-4 py-3 transition ${
                  active
                    ? "border-gold-400/50 bg-gold-400/[0.06]"
                    : "border-white/10 bg-white/[0.02] hover:border-gold-500/30 hover:bg-gold-500/[0.04]"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`text-[11px] uppercase tracking-[0.25em] transition ${
                      active ? "text-gold-100" : "text-gold-200/80"
                    }`}
                  >
                    {meta.label}
                  </p>
                  <p className="mt-1 text-[11px] text-white/45">
                    {active
                      ? `Showing ${meta.label} only. Flip off for the full catalog.`
                      : `Flip on to narrow to ${meta.label} pieces.`}
                  </p>
                </div>
                <span className="sr-only">Toggle {meta.label} filter</span>
                {/* Real checkbox powers the switch — keyboard / screen-reader
                    friendly. The span below is the visual representation. */}
                <input
                  type="checkbox"
                  checked={active}
                  disabled={pending}
                  onChange={() =>
                    setParam("tier", active ? "" : tierKey)
                  }
                  className="peer sr-only"
                  aria-label={`${active ? "Hide" : "Show only"} ${meta.label}`}
                />
                <span
                  aria-hidden
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-gold-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
                    active
                      ? "border-gold-300 bg-gold-400"
                      : "border-white/15 bg-white/10 group-hover:border-gold-500/40"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full shadow-lg shadow-black/30 transition ${
                      active
                        ? "translate-x-6 bg-black"
                        : "translate-x-1 bg-white"
                    }`}
                  />
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-2 text-[10px] uppercase tracking-[0.25em] text-white/35">
          Collections
        </span>
        <button
          type="button"
          onClick={() => {
            // "All" = clear both q and category.
            const next = new URLSearchParams(searchParams.toString());
            next.delete("q");
            next.delete("category");
            startTransition(() => {
              router.push(`/shop?${next.toString()}`);
            });
          }}
          disabled={pending}
          className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
            !q && !categorySlug
              ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
              : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
          }`}
        >
          All
        </button>
        {usingDbCategories
          ? topCategories.map((c) => {
              const active = categorySlug === c.slug;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setParam("category", c.slug)}
                  disabled={pending}
                  className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
                    active
                      ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
                      : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {c.name}
                </button>
              );
            })
          : WATCH_CATEGORIES.map((cat) => {
              const active = q.toLowerCase() === cat.keywords[0].toLowerCase();
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setParam("q", cat.keywords[0])}
                  disabled={pending}
                  className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
                    active
                      ? "border-gold-400/70 bg-gold-400/10 text-gold-100"
                      : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
      </div>
    </div>
  );
}
