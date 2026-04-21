import type { Category, HeroSlide, Product } from "@/lib/types";
import { normaliseTier } from "@/lib/tiers";

export function parseMediaUrls(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}

export function mapProduct(row: Record<string, unknown>): Product {
  const rawQty = row.quantity;
  const quantity =
    rawQty == null || rawQty === ""
      ? row.status === "sold"
        ? 0
        : 1
      : Math.max(0, Math.floor(Number(rawQty)));
  return {
    id: String(row.id),
    name: String(row.name),
    brand: row.brand != null ? String(row.brand) : null,
    model: row.model != null ? String(row.model) : null,
    price: Number(row.price),
    quantity,
    description: row.description != null ? String(row.description) : null,
    media_urls: parseMediaUrls(row.media_urls),
    video_url: row.video_url != null ? String(row.video_url) : null,
    video_poster_url:
      row.video_poster_url != null ? String(row.video_poster_url) : null,
    video_trim_start:
      row.video_trim_start != null && row.video_trim_start !== ""
        ? Number(row.video_trim_start)
        : null,
    video_trim_end:
      row.video_trim_end != null && row.video_trim_end !== ""
        ? Number(row.video_trim_end)
        : null,
    category_id: row.category_id != null ? String(row.category_id) : null,
    status: row.status === "sold" ? "sold" : "available",
    featured: Boolean(row.featured),
    on_wrist_spotlight: row.on_wrist_spotlight !== false,
    created_at: String(row.created_at),
    square_url:
      row.square_url != null && String(row.square_url).trim() !== ""
        ? String(row.square_url)
        : null,
    tier: normaliseTier(row.tier),
  };
}

export function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    tagline: row.tagline != null ? String(row.tagline) : null,
    image_url: row.image_url != null ? String(row.image_url) : null,
    parent_id: row.parent_id != null ? String(row.parent_id) : null,
    sort_order: Number(row.sort_order ?? 0),
    active: row.active === false ? false : true,
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * Order categories into a stable parents-then-children list so it can be
 * rendered both as a flat sorted list and as a tree.
 * Returns an array of `{ category, depth }`.
 */
export function categoryTree(
  cats: Category[]
): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of cats) {
    const key = c.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  byParent.forEach((arr) => {
    arr.sort((a: Category, b: Category) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
  });

  const ids = new Set(cats.map((c) => c.id));
  const out: { category: Category; depth: number }[] = [];
  // Roots: either parent_id null, or parent_id points to something we don't have (orphaned).
  const roots = cats
    .filter(
      (c) => !c.parent_id || !ids.has(c.parent_id)
    )
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });

  const visit = (c: Category, depth: number) => {
    out.push({ category: c, depth });
    const children = byParent.get(c.id) ?? [];
    for (const child of children) visit(child, depth + 1);
  };
  for (const r of roots) visit(r, 0);
  return out;
}

/**
 * Resolve a category slug into a `{ category, descendantIds }` pair.
 * The descendant id list includes the category itself and every sub-category,
 * so filters can match products tagged with either a parent OR any child.
 */
/**
 * Walks `parent_id` links to the top-level (brand) row for a product's category.
 */
export function getRootCategory(
  cats: Category[],
  categoryId: string | null | undefined
): Category | null {
  if (!categoryId) return null;
  const byId = new Map(cats.map((c) => [c.id, c]));
  let current = byId.get(categoryId);
  if (!current) return null;
  const seen = new Set<string>();
  while (current.parent_id) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

/**
 * Stable label for shop brand filtering: prefer the DB brand (root category)
 * when `category_id` is set; otherwise fall back to the legacy `brand` column.
 */
export function productShopBrandLabel(
  p: Product,
  cats: Category[]
): string | null {
  if (p.category_id) {
    const root = getRootCategory(cats, p.category_id);
    if (root?.name?.trim()) return root.name.trim();
  }
  const b = p.brand?.trim();
  return b || null;
}

export function resolveCategoryBySlug(
  cats: Category[],
  slug: string
): { category: Category; ids: string[] } | null {
  const match = cats.find((c) => c.slug === slug);
  if (!match) return null;

  const byParent = new Map<string, Category[]>();
  for (const c of cats) {
    if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
  }
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    for (const child of byParent.get(id) ?? []) walk(child.id);
  };
  walk(match.id);
  return { category: match, ids };
}

export function mapHeroSlide(row: Record<string, unknown>): HeroSlide {
  return {
    id: String(row.id),
    title: String(row.title),
    tagline: row.tagline != null ? String(row.tagline) : null,
    image_url: row.image_url != null ? String(row.image_url) : null,
    video_url: row.video_url != null ? String(row.video_url) : null,
    cta_label: row.cta_label != null ? String(row.cta_label) : null,
    cta_href: row.cta_href != null ? String(row.cta_href) : null,
    active: row.active === false ? false : true,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * What to show in thread previews / notifications when a message is purely an
 * attachment (no text). IG-style: "📷 Photo" / "🎥 Video".
 */
export function messagePreview(m: {
  message?: string | null;
  attachment_type?: "image" | "video" | null | undefined;
}): string {
  const text = m.message?.trim();
  if (text) return text;
  if (m.attachment_type === "image") return "📷 Photo";
  if (m.attachment_type === "video") return "🎥 Video";
  return "";
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
