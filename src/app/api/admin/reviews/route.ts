import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reviews
 *
 * Returns every review across the catalog, newest first, joined with the
 * minimal product fields the admin list needs (name + brand). Used by
 * the `/admin/reviews` page to render the moderation grid.
 *
 * Tolerant of the photos column not existing yet (migration 021): if the
 * `photos` jsonb column is missing the select still succeeds and rows
 * just don't carry that key.
 */
export async function GET() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Try once with `photos`. If PostgREST throws "column does not exist",
  // retry without it so the panel keeps working before migration 021 runs.
  // Cast through `unknown` so the retry result (which has a slimmer column
  // set) can share the variable with the original query.
  let data: unknown = null;
  let error: { message: string } | null = null;
  {
    const res = await supabase
      .from("product_reviews")
      .select(
        "id, product_id, reviewer_name, email, rating, body, approved, created_at, photos, product:products(name, brand)"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    data = res.data;
    error = res.error;
  }

  if (error && /column .* does not exist|photos/i.test(error.message)) {
    const retry = await supabase
      .from("product_reviews")
      .select(
        "id, product_id, reviewer_name, email, rating, body, approved, created_at, product:products(name, brand)"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (/relation|table .* does not exist/i.test(error.message)) {
      return NextResponse.json({
        reviews: [],
        warning: "Reviews table not migrated yet (run 017_product_reviews.sql).",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: data ?? [] });
}
