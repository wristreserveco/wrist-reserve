"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product, ProductStatus } from "@/lib/types";
import { categoryTree, formatPrice, mapCategory, mapProduct } from "@/lib/products";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { ShareProductButton } from "@/components/admin/ShareProductButton";
import { WATCH_BRANDS, modelsForBrand } from "@/lib/data/watches";
import {
  DEFAULT_TIER,
  PRODUCT_TIERS,
  TIER_META,
  type ProductTier,
} from "@/lib/tiers";

interface FormState {
  name: string;
  brand: string;
  model: string;
  price: number;
  quantity: number;
  description: string;
  media_urls: string[];
  video_url: string | null;
  video_poster_url: string | null;
  video_trim_start: number | null;
  video_trim_end: number | null;
  category_id: string | null;
  status: ProductStatus;
  featured: boolean;
  /** Homepage “Already on wrists” strip (applies when sold / sold out). */
  on_wrist_spotlight: boolean;
  square_url: string;
  tier: ProductTier;
}

function emptyForm(): FormState {
  return {
    name: "",
    brand: "",
    model: "",
    price: 0,
    quantity: 1,
    description: "",
    media_urls: [],
    video_url: null,
    video_poster_url: null,
    video_trim_start: null,
    video_trim_end: null,
    category_id: null,
    status: "available",
    featured: false,
    on_wrist_spotlight: true,
    square_url: "",
    tier: DEFAULT_TIER,
  };
}

// Columns that were added in later migrations — auto-fallback if DB is missing them.
const OPTIONAL_COLUMNS = [
  "model",
  "quantity",
  "category_id",
  "video_poster_url",
  "video_trim_start",
  "video_trim_end",
  "square_url",
  "tier",
  "on_wrist_spotlight",
] as const;

/**
 * Normalise a string for fuzzy matching: drop diacritics, strip punctuation,
 * collapse whitespace, lowercase.
 */
function normaliseName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Best-effort: given a brand + model text, find the deepest matching category.
 * Prefers an exact child-of-brand match, falls back to the brand itself.
 */
function autoMatchCategoryId(
  categories: Category[],
  brand: string,
  model: string
): string | null {
  const bNorm = normaliseName(brand);
  if (!bNorm) return null;
  const parent = categories.find((c) => !c.parent_id && normaliseName(c.name) === bNorm);
  if (!parent) return null;

  const mNorm = normaliseName(model);
  if (mNorm) {
    const childrenOfParent = categories.filter((c) => c.parent_id === parent.id);
    // Prefer exact match, then "starts with", then "contains".
    const exact = childrenOfParent.find((c) => normaliseName(c.name) === mNorm);
    if (exact) return exact.id;
    const starts = childrenOfParent.find((c) =>
      mNorm.startsWith(normaliseName(c.name))
    );
    if (starts) return starts.id;
    const includes = childrenOfParent.find((c) =>
      normaliseName(c.name).length >= 3 && mNorm.includes(normaliseName(c.name))
    );
    if (includes) return includes.id;
  }

  return parent.id;
}

export function AdminProductsManager() {
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | ProductTier>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "category">(() => {
    if (typeof window === "undefined") return "grid";
    const stored = window.localStorage.getItem("admin-products-view");
    return stored === "grid" || stored === "list" || stored === "category"
      ? stored
      : "grid";
  });
  // When viewMode === "category", this drills into a specific brand / sub-cat.
  // `null` = show the top-level category tiles (Rolex, AP, …).
  // `"__unassigned__"` = products with no category set.
  const [categoryDrillId, setCategoryDrillId] = useState<string | null>(null);
  // Tracks whether the admin has manually picked a category for the current form.
  // When false, we keep the category in sync with the brand/model fields.
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin-products-view", viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    // Reset the drill when leaving category view so it starts fresh next time.
    if (viewMode !== "category") setCategoryDrillId(null);
  }, [viewMode]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error: qError }, { data: catData }] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (qError) {
      setError(qError.message);
      setRows([]);
    } else {
      setRows((data ?? []).map((r) => mapProduct(r as Record<string, unknown>)));
      setError(null);
    }
    if (catData) {
      setCategories(
        catData.map((c) => mapCategory(c as Record<string, unknown>))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setCategoryManuallySet(false);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    // If the existing product has a category, treat it as "admin's choice" —
    // we won't auto-override it when brand/model changes. (They can still
    // switch to "— None —" to re-enable auto-linking.)
    setCategoryManuallySet(Boolean(p.category_id));
    setForm({
      name: p.name,
      brand: p.brand ?? "",
      model: p.model ?? "",
      price: p.price,
      quantity: p.quantity,
      description: p.description ?? "",
      media_urls: p.media_urls ?? [],
      video_url: p.video_url ?? null,
      video_poster_url: p.video_poster_url ?? null,
      video_trim_start: p.video_trim_start ?? null,
      video_trim_end: p.video_trim_end ?? null,
      category_id: p.category_id ?? null,
      status: p.status,
      featured: p.featured,
      on_wrist_spotlight: p.on_wrist_spotlight !== false,
      square_url: p.square_url ?? "",
      tier: p.tier ?? DEFAULT_TIER,
    });
    setModalOpen(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const trimmedName = form.name.trim();
    if (!trimmedName || !Number.isFinite(form.price) || form.price < 0) {
      setError("Name and valid price are required.");
      setSaving(false);
      return;
    }

    const qty = Math.max(0, Math.floor(Number(form.quantity) || 0));
    const derivedStatus: ProductStatus =
      qty <= 0 ? "sold" : form.status === "sold" ? "available" : form.status;

    const payload: Record<string, unknown> = {
      name: trimmedName,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      price: Number(form.price),
      quantity: qty,
      description: form.description.trim() || null,
      media_urls: form.media_urls,
      video_url: form.video_url || null,
      video_poster_url: form.video_poster_url || null,
      video_trim_start: form.video_trim_start ?? null,
      video_trim_end: form.video_trim_end ?? null,
      category_id: form.category_id || null,
      status: derivedStatus,
      featured: form.featured,
      on_wrist_spotlight: form.on_wrist_spotlight,
      square_url: form.square_url.trim() || null,
      tier: form.tier,
    };

    const trySave = async (data: Record<string, unknown>) => {
      if (editing) {
        return supabase.from("products").update(data).eq("id", editing.id);
      }
      return supabase.from("products").insert(data);
    };

    let res = await trySave(payload);
    // Column-missing fallback: keep stripping optional columns until it succeeds.
    while (
      res.error &&
      /column|does not exist|schema|unknown/i.test(res.error.message)
    ) {
      const offending = OPTIONAL_COLUMNS.find((c) =>
        res.error!.message.includes(c)
      );
      if (!offending) break;
      delete payload[offending];
      res = await trySave(payload);
    }

    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    const supabase = createClient();
    const { error: dError } = await supabase.from("products").delete().eq("id", id);
    if (dError) setError(dError.message);
    await load();
  }

  async function toggleFeatured(p: Product) {
    const supabase = createClient();
    await supabase.from("products").update({ featured: !p.featured }).eq("id", p.id);
    await load();
  }

  async function toggleOnWrist(p: Product) {
    const supabase = createClient();
    const current = p.on_wrist_spotlight !== false;
    const { error } = await supabase
      .from("products")
      .update({ on_wrist_spotlight: !current })
      .eq("id", p.id);
    if (
      error &&
      /column|does not exist|schema|unknown/i.test(error.message)
    ) {
      setError(
        'Run migration 015_on_wrist_spotlight.sql so the "On wrists" toggle can save.',
      );
      return;
    }
    if (error) setError(error.message);
    await load();
  }

  async function toggleStatus(p: Product) {
    const supabase = createClient();
    const next: ProductStatus = p.status === "available" ? "sold" : "available";
    const qty = next === "sold" ? 0 : Math.max(1, p.quantity);
    await supabase
      .from("products")
      .update({ status: next, quantity: qty })
      .eq("id", p.id);
    await load();
  }

  async function adjustQuantity(p: Product, delta: number) {
    const nextQty = Math.max(0, p.quantity + delta);
    const supabase = createClient();
    await supabase
      .from("products")
      .update({
        quantity: nextQty,
        status: nextQty === 0 ? "sold" : "available",
      })
      .eq("id", p.id);
    await load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tierFilter !== "all" && (r.tier ?? DEFAULT_TIER) !== tierFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q) ||
        (r.model ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, tierFilter]);

  // All unique brand suggestions (static watch list + any custom brand the user
  // has already used in their catalog).
  const brandSuggestions = useMemo(() => {
    const set = new Set<string>(WATCH_BRANDS);
    rows.forEach((r) => {
      if (r.brand) set.add(r.brand);
    });
    return Array.from(set).sort();
  }, [rows]);

  // Models scoped to the selected brand, plus any models this user has typed
  // before against that brand (so their own refs live alongside the defaults).
  const modelSuggestions = useMemo(() => {
    const fromData = modelsForBrand(form.brand);
    const set = new Set<string>(fromData);
    rows
      .filter(
        (r) =>
          r.brand &&
          form.brand &&
          r.brand.toLowerCase() === form.brand.trim().toLowerCase()
      )
      .forEach((r) => {
        if (r.model) set.add(r.model);
      });
    return Array.from(set).sort();
  }, [form.brand, rows]);

  const categoryPath = useCallback(
    (id: string | null): string => {
      if (!id) return "";
      const byId = new Map(categories.map((c) => [c.id, c]));
      const target = byId.get(id);
      if (!target) return "";
      if (!target.parent_id) return target.name;
      const parent = byId.get(target.parent_id);
      return parent ? `${parent.name} › ${target.name}` : target.name;
    },
    [categories]
  );

  const categoryLookup = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Auto-link brand + model to a category when the user hasn't manually chosen one.
  // This is the "Brand IS my category" shortcut: type "Rolex" + "Submariner" and
  // the Category dropdown snaps to Rolex › Submariner with zero extra clicks.
  useEffect(() => {
    if (!modalOpen) return;
    if (categoryManuallySet) return;
    if (categories.length === 0) return;
    const match = autoMatchCategoryId(categories, form.brand, form.model);
    if (match !== form.category_id) {
      setForm((f) => ({ ...f, category_id: match }));
    }
  }, [
    modalOpen,
    categoryManuallySet,
    categories,
    form.brand,
    form.model,
    form.category_id,
  ]);

  // Human-readable suggested path for the tiny helper text next to the dropdown.
  const autoSuggestedPath = useMemo(() => {
    if (categoryManuallySet) return null;
    const id = autoMatchCategoryId(categories, form.brand, form.model);
    if (!id) return null;
    const target = categoryLookup.get(id);
    if (!target) return null;
    if (!target.parent_id) return target.name;
    const parent = categoryLookup.get(target.parent_id);
    return parent ? `${parent.name} › ${target.name}` : target.name;
  }, [categoryManuallySet, categories, form.brand, form.model, categoryLookup]);

  // Build parent->children + descendant lookup once per categories change.
  const { childrenByParent, descendantsById, topLevelCategories } = useMemo(() => {
    const children = new Map<string | null, Category[]>();
    for (const c of categories) {
      const key = c.parent_id;
      const arr = children.get(key) ?? [];
      arr.push(c);
      children.set(key, arr);
    }
    const descendants = new Map<string, string[]>();
    const walk = (id: string): string[] => {
      if (descendants.has(id)) return descendants.get(id)!;
      const acc = [id];
      for (const child of children.get(id) ?? []) acc.push(...walk(child.id));
      descendants.set(id, acc);
      return acc;
    };
    for (const c of categories) walk(c.id);
    const tops = (children.get(null) ?? []).slice().sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    return {
      childrenByParent: children,
      descendantsById: descendants,
      topLevelCategories: tops,
    };
  }, [categories]);

  // Count products per category (including descendants) for tile badges.
  const productCountByCategory = useMemo(() => {
    const directCounts = new Map<string | null, number>();
    for (const p of rows) {
      const key = p.category_id ?? null;
      directCounts.set(key, (directCounts.get(key) ?? 0) + 1);
    }
    const totals = new Map<string, number>();
    for (const c of categories) {
      let total = 0;
      for (const descId of descendantsById.get(c.id) ?? [c.id]) {
        total += directCounts.get(descId) ?? 0;
      }
      totals.set(c.id, total);
    }
    return {
      perCategoryIncludingSubs: totals,
      unassigned: directCounts.get(null) ?? 0,
    };
  }, [rows, categories, descendantsById]);

  // Products that match the category drill (if active) AND the text search.
  const filteredForCategoryView = useMemo(() => {
    if (!categoryDrillId) return [] as Product[];
    if (categoryDrillId === "__unassigned__") {
      return filtered.filter((p) => !p.category_id);
    }
    const allowed = new Set(descendantsById.get(categoryDrillId) ?? [categoryDrillId]);
    return filtered.filter((p) => p.category_id && allowed.has(p.category_id));
  }, [categoryDrillId, descendantsById, filtered]);

  const drillCategory = categoryDrillId && categoryDrillId !== "__unassigned__"
    ? categoryLookup.get(categoryDrillId) ?? null
    : null;
  const drillParent = drillCategory?.parent_id
    ? categoryLookup.get(drillCategory.parent_id) ?? null
    : null;
  const drillChildren = drillCategory
    ? (childrenByParent.get(drillCategory.id) ?? []).slice().sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
      )
    : [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Products</h1>
          <p className="mt-2 text-sm text-white/45">
            Manage catalog, media, inventory, and availability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-sm border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                viewMode === "grid"
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white"
              }`}
              aria-label="Card view"
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                viewMode === "list"
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white"
              }`}
              aria-label="List view"
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("category")}
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                viewMode === "category"
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white"
              }`}
              aria-label="By category view"
            >
              By category
            </button>
          </div>
          <div className="flex overflow-hidden rounded-sm border border-white/10">
            <button
              type="button"
              onClick={() => setTierFilter("all")}
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                tierFilter === "all"
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white"
              }`}
            >
              All tiers
            </button>
            {PRODUCT_TIERS.map((tierKey) => (
              <button
                key={tierKey}
                type="button"
                onClick={() => setTierFilter(tierKey)}
                className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                  tierFilter === tierKey
                    ? tierKey === "super_tier"
                      ? "bg-gold-400 text-black"
                      : "bg-white text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {TIER_META[tierKey].label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-48 rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
          />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
          >
            + Add product
          </button>
        </div>
      </div>

      {error ? <p className="mt-6 text-sm text-red-400/90">{error}</p> : null}

      {viewMode === "category" && !loading ? (
        <CategoryNav
          drillId={categoryDrillId}
          drillCategory={drillCategory}
          drillParent={drillParent}
          drillChildren={drillChildren}
          topLevel={topLevelCategories}
          counts={productCountByCategory.perCategoryIncludingSubs}
          unassignedCount={productCountByCategory.unassigned}
          onSelect={setCategoryDrillId}
        />
      ) : null}

      {loading ? (
        <p className="mt-10 text-sm text-white/40">Loading…</p>
      ) : viewMode === "category" && !categoryDrillId ? null : (viewMode === "category"
          ? filteredForCategoryView
          : filtered
        ).length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 rounded-sm border border-dashed border-white/10 bg-zinc-950/60 p-16 text-center">
          <p className="font-display text-xl text-white">
            {query ? "No matches." : "No products yet."}
          </p>
          <p className="max-w-sm text-sm text-white/45">
            {query
              ? "Try a different search."
              : "Add your first watch — drop images, set brand/model, price & quantity, and it goes live instantly."}
          </p>
          {!query ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-2 rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
            >
              Add your first product
            </button>
          ) : null}
        </div>
      ) : viewMode === "list" ? (
        <ListViewInline
          products={filtered}
          categoryPath={categoryPath}
          categoryLookup={categoryLookup}
          onEdit={openEdit}
          onDelete={onDelete}
          onAdjustQuantity={adjustQuantity}
          onToggleOnWrist={toggleOnWrist}
        />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(viewMode === "category" ? filteredForCategoryView : filtered).map((p) => {
            const cover = p.media_urls?.[0];
            const outOfStock = p.quantity <= 0;
            const cat = p.category_id ? categoryLookup.get(p.category_id) : null;
            return (
              <div
                key={p.id}
                className="group overflow-hidden rounded-sm border border-white/10 bg-zinc-950/80 transition hover:border-gold-400/30"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-black">
                  {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cover}
                      alt={p.name}
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.18em] text-white/30">
                      No image
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    {p.tier === "super_tier" ? (
                      <span className="rounded-sm border border-gold-400/70 bg-gold-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-100">
                        {TIER_META.super_tier.label}
                      </span>
                    ) : null}
                    {p.featured ? (
                      <span className="rounded-sm bg-gold-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-black">
                        Featured
                      </span>
                    ) : null}
                    {outOfStock && p.on_wrist_spotlight !== false ? (
                      <span className="rounded-sm border border-white/25 bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/90">
                        On wrists
                      </span>
                    ) : null}
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${
                        outOfStock
                          ? "bg-red-500/80 text-white"
                          : p.quantity <= 2
                          ? "bg-amber-500/80 text-black"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      {outOfStock ? "Sold Out" : `${p.quantity} in stock`}
                    </span>
                  </div>
                  {p.video_url ? (
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/70">
                      ▶ Video
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg text-white">
                        {p.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs uppercase tracking-[0.18em] text-white/35">
                        {[p.brand, p.model].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-gold-200">
                      {formatPrice(p.price)}
                    </p>
                  </div>
                  {cat ? (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                      {cat.name}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void adjustQuantity(p, -1)}
                      disabled={p.quantity <= 0}
                      className="h-7 w-7 rounded-sm border border-white/10 text-white/70 transition hover:border-white hover:text-white disabled:opacity-30"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="min-w-[2.5rem] text-center text-sm text-white">
                      {p.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => void adjustQuantity(p, 1)}
                      className="h-7 w-7 rounded-sm border border-white/10 text-white/70 transition hover:border-white hover:text-white"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/35">
                      units
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-sm border border-white/15 px-3 py-1.5 text-white/85 transition hover:border-white hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleFeatured(p)}
                      className={`rounded-sm border px-3 py-1.5 transition ${
                        p.featured
                          ? "border-gold-400/60 text-gold-200 hover:border-gold-300"
                          : "border-white/10 text-white/50 hover:border-white/30 hover:text-white/80"
                      }`}
                    >
                      {p.featured ? "Unfeature" : "Feature"}
                    </button>
                    {outOfStock ? (
                      <button
                        type="button"
                        onClick={() => void toggleOnWrist(p)}
                        className={`rounded-sm border px-3 py-1.5 transition ${
                          p.on_wrist_spotlight !== false
                            ? "border-white/30 text-white/80 hover:border-white/50"
                            : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/75"
                        }`}
                      >
                        {p.on_wrist_spotlight !== false
                          ? "Remove from on-wrists"
                          : "Show on on-wrists"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void toggleStatus(p)}
                      className="rounded-sm border border-white/10 px-3 py-1.5 text-white/60 transition hover:border-white/30 hover:text-white"
                    >
                      Mark {outOfStock ? "available" : "sold"}
                    </button>
                    <ShareProductButton productId={p.id} />
                    <button
                      type="button"
                      onClick={() => void onDelete(p.id)}
                      className="ml-auto rounded-sm px-3 py-1.5 text-white/35 transition hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {modalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            onClick={() => !saving && setModalOpen(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={(e) => void onSave(e)}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-white/10 bg-zinc-950 p-6 shadow-2xl sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl text-white">
                  {editing ? "Edit product" : "New product"}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="text-xs uppercase tracking-[0.18em] text-white/45 hover:text-white"
                >
                  Close
                </button>
              </div>

              <datalist id="brand-suggestions">
                {brandSuggestions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="model-suggestions">
                {modelSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
                {/* Media column */}
                <div className="order-2 lg:order-1">
                  <MediaUploader
                    images={form.media_urls}
                    onImagesChange={(urls) =>
                      setForm((f) => ({ ...f, media_urls: urls }))
                    }
                    video={{
                      url: form.video_url,
                      posterUrl: form.video_poster_url,
                      trimStart: form.video_trim_start,
                      trimEnd: form.video_trim_end,
                    }}
                    onVideoChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        video_url: v.url,
                        video_poster_url: v.posterUrl,
                        video_trim_start: v.trimStart,
                        video_trim_end: v.trimEnd,
                      }))
                    }
                  />
                </div>

                {/* Details column */}
                <div className="order-1 space-y-4 lg:order-2">
                  <Field label="Name">
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      placeholder="e.g. Rolex Submariner Date"
                      className="input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Brand">
                      <input
                        value={form.brand}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            brand: e.target.value,
                            // reset model if brand switches and current model
                            // doesn't belong to the new brand
                            model: modelsForBrand(e.target.value).some(
                              (m) =>
                                m.toLowerCase() === f.model.toLowerCase()
                            )
                              ? f.model
                              : "",
                          }))
                        }
                        list="brand-suggestions"
                        placeholder="Rolex, Patek…"
                        className="input"
                      />
                    </Field>
                    <Field label="Model">
                      <input
                        value={form.model}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, model: e.target.value }))
                        }
                        list="model-suggestions"
                        placeholder={
                          form.brand
                            ? "Submariner, Daytona…"
                            : "Pick a brand first"
                        }
                        className="input"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price (USD)">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.price}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, price: Number(e.target.value) }))
                        }
                        required
                        className="input"
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={form.quantity}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          }))
                        }
                        className="input"
                      />
                    </Field>
                  </div>

                  <Field label="Category">
                    <select
                      value={form.category_id ?? ""}
                      onChange={(e) => {
                        const next = e.target.value || null;
                        setForm((f) => ({ ...f, category_id: next }));
                        // Empty selection re-enables auto-linking; any other choice
                        // is treated as an explicit override and we stop auto-syncing.
                        setCategoryManuallySet(next !== null);
                      }}
                      className="input"
                    >
                      <option value="">— None —</option>
                      {categoryTree(categories).map(({ category, depth }) => (
                        <option key={category.id} value={category.id}>
                          {depth > 0 ? `\u00A0\u00A0\u00A0\u00A0↳ ` : ""}
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {categories.length === 0 ? (
                      <p className="mt-1 text-[10px] text-white/35">
                        No categories yet —{" "}
                        <a
                          href="/admin/categories"
                          className="underline decoration-dotted hover:text-white"
                        >
                          import the default brand list
                        </a>
                        {" "}in one click.
                      </p>
                    ) : !categoryManuallySet && autoSuggestedPath ? (
                      <p className="mt-1 text-[10px] text-gold-300/80">
                        Auto-matched from Brand / Model ·{" "}
                        <span className="text-gold-100">{autoSuggestedPath}</span>
                      </p>
                    ) : !categoryManuallySet && (form.brand || form.model) ? (
                      <p className="mt-1 text-[10px] text-white/35">
                        Pick a brand like &ldquo;Rolex&rdquo; and the category snaps into
                        place automatically.
                      </p>
                    ) : categoryManuallySet ? (
                      <p className="mt-1 text-[10px] text-white/35">
                        Manually overridden — choose &ldquo;— None —&rdquo; to re-enable
                        auto-linking.
                      </p>
                    ) : null}
                  </Field>

                  <Field label="Description">
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      rows={5}
                      placeholder="Reference, movement, origin, any collector notes…"
                      className="input resize-none"
                    />
                  </Field>

                  <Field label="Tier">
                    <div className="flex flex-wrap gap-2">
                      {PRODUCT_TIERS.map((tierKey) => {
                        const meta = TIER_META[tierKey];
                        const active = form.tier === tierKey;
                        return (
                          <button
                            key={tierKey}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({ ...f, tier: tierKey }))
                            }
                            className={`rounded-sm border px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition ${
                              active
                                ? tierKey === "super_tier"
                                  ? "border-gold-400 bg-gold-400/15 text-gold-100"
                                  : "border-white bg-white/10 text-white"
                                : "border-white/15 text-white/55 hover:border-white/35 hover:text-white/90"
                            }`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-white/35">
                      {form.tier === "super_tier"
                        ? `Tagged as ${TIER_META.super_tier.label} — shown with a gold badge on cards and featured on the homepage strip.`
                        : `No public tier — this label is admin-only. Customers see it as regular catalog.`}
                    </p>
                  </Field>

                  <Field label="Square checkout link (optional)">
                    <input
                      type="url"
                      inputMode="url"
                      value={form.square_url}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, square_url: e.target.value }))
                      }
                      placeholder="https://checkout.square.site/…"
                      className="input"
                    />
                    <p className="mt-1 text-[10px] text-white/35">
                      Paste the Square payment link you&rsquo;d use on Instagram for
                      this watch. If left blank, the default store Square link is used.
                    </p>
                  </Field>

                  <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-start sm:gap-10">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                      <input
                        type="checkbox"
                        checked={form.featured}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, featured: e.target.checked }))
                        }
                        className="h-4 w-4 accent-gold-400"
                      />
                      Featured
                    </label>
                    <div className="max-w-md">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                        <input
                          type="checkbox"
                          checked={form.on_wrist_spotlight}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              on_wrist_spotlight: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-gold-400"
                        />
                        “Already on wrists” homepage strip
                      </label>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                        When this listing is sold out, it can still appear under
                        Recently shipped on the homepage. Uncheck to pull it from
                        that strip (the product page can stay up for reference).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between gap-3 border-t border-white/10 pt-6">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      void onDelete(editing.id);
                    }}
                    className="text-xs uppercase tracking-[0.18em] text-white/40 hover:text-red-400"
                  >
                    Delete product
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-sm px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/55 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-sm bg-white px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : editing ? "Save changes" : "Create"}
                  </button>
                </div>
              </div>

              <style jsx>{`
                .input {
                  width: 100%;
                  border-radius: 2px;
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  background: #000;
                  padding: 10px 12px;
                  color: #fff;
                  font-size: 14px;
                  outline: none;
                  transition: border-color 0.15s ease;
                }
                .input:focus {
                  border-color: rgba(223, 192, 127, 0.4);
                  box-shadow: 0 0 0 1px rgba(223, 192, 127, 0.3);
                }
              `}</style>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function CategoryNav({
  drillId,
  drillCategory,
  drillParent,
  drillChildren,
  topLevel,
  counts,
  unassignedCount,
  onSelect,
}: {
  drillId: string | null;
  drillCategory: Category | null;
  drillParent: Category | null;
  drillChildren: Category[];
  topLevel: Category[];
  counts: Map<string, number>;
  unassignedCount: number;
  onSelect: (id: string | null) => void;
}) {
  // Root: tile grid.
  if (!drillId) {
    return (
      <div className="mt-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
          Browse by brand
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {topLevel.map((c) => {
            const count = counts.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="group flex items-center justify-between gap-3 rounded-sm border border-white/10 bg-zinc-950/60 px-4 py-4 text-left transition hover:border-gold-400/40 hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-lg text-white">
                    {c.name}
                  </p>
                  {c.tagline ? (
                    <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.18em] text-white/35">
                      {c.tagline}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-sm bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70 group-hover:bg-gold-400/20 group-hover:text-gold-100">
                  {count}
                </span>
              </button>
            );
          })}
          {unassignedCount > 0 ? (
            <button
              type="button"
              onClick={() => onSelect("__unassigned__")}
              className="group flex items-center justify-between gap-3 rounded-sm border border-dashed border-white/15 bg-zinc-950/40 px-4 py-4 text-left transition hover:border-amber-400/50"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-lg text-amber-200/90">
                  Uncategorized
                </p>
                <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.18em] text-white/35">
                  Assign a brand to clean these up
                </p>
              </div>
              <span className="shrink-0 rounded-sm bg-amber-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                {unassignedCount}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Drilled in: breadcrumb + sub-cat chips.
  const isUnassigned = drillId === "__unassigned__";
  return (
    <div className="mt-8 space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="hover:text-white"
        >
          All brands
        </button>
        <span>›</span>
        {drillParent ? (
          <>
            <button
              type="button"
              onClick={() => onSelect(drillParent.id)}
              className="hover:text-white"
            >
              {drillParent.name}
            </button>
            <span>›</span>
          </>
        ) : null}
        <span className="text-white">
          {isUnassigned ? "Uncategorized" : drillCategory?.name ?? ""}
        </span>
      </nav>

      {drillChildren.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gold-100">
            All {drillCategory?.name}
          </span>
          {drillChildren.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white hover:text-white"
            >
              {c.name}
              <span className="ml-1.5 text-white/40">
                {counts.get(c.id) ?? 0}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListViewInline({
  products,
  categoryPath,
  categoryLookup,
  onEdit,
  onDelete,
  onAdjustQuantity,
  onToggleOnWrist,
}: {
  products: Product[];
  categoryPath: (id: string | null) => string;
  categoryLookup: Map<string, Category>;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void | Promise<void>;
  onAdjustQuantity: (p: Product, delta: number) => void | Promise<void>;
  onToggleOnWrist?: (p: Product) => void | Promise<void>;
}) {
  return (
    <div className="mt-8 overflow-x-auto rounded-sm border border-white/10 bg-zinc-950/60">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-white/40">
          <tr>
            <th className="px-3 py-3">Item</th>
            <th className="px-3 py-3">Brand / Model</th>
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3">Price</th>
            <th className="px-3 py-3">Qty</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-white/80">
          {products.map((p) => {
            const cover = p.media_urls?.[0];
            const outOfStock = p.quantity <= 0;
            const cat = p.category_id ? categoryLookup.get(p.category_id) : null;
            return (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-black">
                      {cover ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={cover}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{p.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {p.tier === "super_tier" ? (
                          <span className="text-[9px] uppercase tracking-[0.18em] text-gold-200">
                            {TIER_META.super_tier.label}
                          </span>
                        ) : null}
                        {p.featured ? (
                          <span className="text-[9px] uppercase tracking-[0.18em] text-gold-300">
                            Featured
                          </span>
                        ) : null}
                        {outOfStock && p.on_wrist_spotlight !== false ? (
                          <span className="text-[9px] uppercase tracking-[0.18em] text-white/50">
                            On wrists
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-white/60">
                  {p.brand ? (
                    <span className="block">{p.brand}</span>
                  ) : (
                    <span className="block text-white/30">—</span>
                  )}
                  {p.model ? (
                    <span className="block text-[11px] text-white/40">
                      {p.model}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-white/55">
                  {cat ? (
                    categoryPath(p.category_id)
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gold-200">{formatPrice(p.price)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onAdjustQuantity(p, -1)}
                      disabled={p.quantity <= 0}
                      className="h-6 w-6 rounded-sm border border-white/10 text-white/70 hover:border-white hover:text-white disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="min-w-[2rem] text-center">{p.quantity}</span>
                    <button
                      type="button"
                      onClick={() => void onAdjustQuantity(p, 1)}
                      className="h-6 w-6 rounded-sm border border-white/10 text-white/70 hover:border-white hover:text-white"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] ${
                      outOfStock
                        ? "bg-red-500/20 text-red-300"
                        : p.quantity <= 2
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {outOfStock
                      ? "Sold out"
                      : p.quantity <= 2
                      ? "Low"
                      : "In stock"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                    {outOfStock && onToggleOnWrist ? (
                      <button
                        type="button"
                        onClick={() => void onToggleOnWrist(p)}
                        className="text-[10px] uppercase tracking-[0.18em] text-white/45 hover:text-white"
                      >
                        {p.on_wrist_spotlight !== false
                          ? "Hide strip"
                          : "Show strip"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onEdit(p)}
                      className="text-[10px] uppercase tracking-[0.18em] text-gold-300 hover:text-gold-200"
                    >
                      Edit
                    </button>
                    <ShareProductButton
                      productId={p.id}
                      className="text-[10px] uppercase tracking-[0.18em] text-white/55 hover:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void onDelete(p.id)}
                      className="text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
