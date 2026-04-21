import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/env";
import { mapCategory } from "@/lib/products";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public category list for the storefront nav (and similar).
 * Only includes brands / subcategories that actually have buyable inventory,
 * so the mega-menu never shows a wall of empty model rows from seed data.
 */
function filterCategoriesWithInventory(
  categories: Category[],
  liveCategoryIds: Set<string>
): Category[] {
  const brandsWithInventory = new Set<string>();
  for (const cat of categories) {
    if (!liveCategoryIds.has(cat.id)) continue;
    brandsWithInventory.add(cat.parent_id ?? cat.id);
  }
  return categories.filter((c) => {
    if (!c.parent_id) {
      return brandsWithInventory.has(c.id);
    }
    return liveCategoryIds.has(c.id);
  });
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }
  const { searchParams } = new URL(request.url);
  /** Full tree for internal tools; default public = inventory-filtered nav. */
  const all = searchParams.get("all") === "1";

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json([], { status: 200 });
  }

  let cats = (data ?? []).map((row) => mapCategory(row as Record<string, unknown>));

  if (!all) {
    const { data: prodRows } = await supabase
      .from("products")
      .select("category_id, status")
      .neq("status", "sold")
      .not("category_id", "is", null);

    const liveCategoryIds = new Set<string>();
    for (const row of prodRows ?? []) {
      const cid = (row as { category_id?: string | null }).category_id;
      if (cid) liveCategoryIds.add(String(cid));
    }
    cats = filterCategoriesWithInventory(cats, liveCategoryIds);
  }

  return NextResponse.json(cats, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60",
    },
  });
}
