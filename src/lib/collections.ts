import type { Category, Product } from "@/lib/types";
import { getRootCategory, productIsShopBuyable } from "@/lib/products";
import { pickCollectionCoverImage } from "@/lib/collections/stock-covers";

export type BrandCollectionCard = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  coverImage: string;
  pieceCount: number;
  shopHref: string;
  sortOrder: number;
};

function categoryTreeIds(brandId: string, categories: Category[]): Set<string> {
  const byParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
  }
  const ids = new Set<string>([brandId]);
  const walk = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      ids.add(child.id);
      walk(child.id);
    }
  };
  walk(brandId);
  return ids;
}

function productsForBrand(
  brand: Category,
  products: Product[],
  categories: Category[]
): Product[] {
  const tree = categoryTreeIds(brand.id, categories);
  const nameKey = brand.name.trim().toLowerCase();

  return products.filter((p) => {
    if (!productIsShopBuyable(p)) return false;
    if (p.category_id && tree.has(p.category_id)) return true;
    const root = getRootCategory(categories, p.category_id);
    if (root?.id === brand.id) return true;
    if (!p.category_id && (p.brand?.trim().toLowerCase() ?? "") === nameKey) {
      return true;
    }
    return false;
  });
}

/**
 * Homepage "Find your piece" tiles — model/stock covers matched to your inventory
 * (Big Bang–style sport shots, Sub/Daytona/Nautilus heroes, etc.), with your
 * uploaded photos as fallback. No seed Wikipedia listing thumbs.
 */
export function buildBrandCollectionCards(
  products: Product[],
  categories: Category[]
): BrandCollectionCard[] {
  const parents = categories.filter((c) => !c.parent_id && c.active);

  const cards: BrandCollectionCard[] = [];

  for (const brand of parents) {
    const inventory = productsForBrand(brand, products, categories);
    if (inventory.length === 0) continue;

    const cover = pickCollectionCoverImage(
      brand.slug,
      inventory,
      brand.image_url
    );
    if (!cover) continue;

    cards.push({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      tagline: brand.tagline,
      coverImage: cover,
      pieceCount: inventory.length,
      shopHref: `/shop?category=${encodeURIComponent(brand.slug)}`,
      sortOrder: brand.sort_order,
    });
  }

  return cards.sort((a, b) => a.sortOrder - b.sortOrder);
}
