import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminReviewsManager } from "@/components/admin/AdminReviewsManager";

export const dynamic = "force-dynamic";

/**
 * Admin → Reviews
 *
 * Server-renders the initial review list (joined with the parent product)
 * for fast paint, then hands off to the client manager which handles
 * inline edit / delete / photo upload via the admin API routes.
 */
export default async function AdminReviewsPage() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  const supabase = createServiceClient();

  // Same fault-tolerant select used by /api/admin/reviews — try with the
  // photos column, retry without it if migration 021 hasn't run yet.
  let warning: string | undefined;
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
    warning =
      "Photo attachments not yet enabled. Run migration 021_review_photos.sql in Supabase to allow uploading images to reviews.";
  }

  if (error && /relation|table .* does not exist/i.test(error.message)) {
    warning =
      "Reviews table not migrated yet. Run 017_product_reviews.sql in Supabase.";
    data = [];
  } else if (error) {
    warning = `Could not load reviews: ${error.message}`;
    data = [];
  }

  // Supabase's TS types model joined relations as arrays; at runtime the
  // single-row join returns either an object or null. Normalize before
  // handing off to the client manager.
  type Raw = {
    id: string;
    product_id: string;
    reviewer_name: string;
    email: string | null;
    rating: number;
    body: string;
    approved: boolean;
    created_at: string;
    photos?: string[] | null;
    product?:
      | { name: string | null; brand: string | null }
      | { name: string | null; brand: string | null }[]
      | null;
  };
  const rows = (data ?? []) as Raw[];
  const normalized = rows.map((r) => ({
    ...r,
    product: Array.isArray(r.product) ? r.product[0] ?? null : r.product ?? null,
  }));

  return (
    <AdminReviewsManager
      initialReviews={normalized}
      initialWarning={warning}
    />
  );
}
