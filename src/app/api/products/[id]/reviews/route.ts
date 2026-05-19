import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

interface Body {
  reviewer_name?: string;
  email?: string;
  rating?: number;
  body?: string;
  /** Honeypot — if filled, the client is a bot; we silently drop. */
  website?: string;
}

/**
 * POST /api/products/:id/reviews
 *
 * Public endpoint. Anyone can submit a review for a product; reviews are
 * auto-approved so they appear instantly. Bot pressure is reduced via a
 * hidden honeypot field.
 *
 * Admin moderation (edit / delete / backdate / attach photos) lives at
 * /admin/reviews and uses /api/admin/reviews[/:id] — there are NO admin
 * affordances on this public endpoint, by design.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Hard cap review spam: 5 reviews per IP per hour. Real shoppers leave
  // one review per purchase. Anything beyond is a bot or someone trying to
  // brigade a product.
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `review-submit:${ip}`,
    limit: 5,
    windowSec: 60 * 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  const productId = params.id;
  if (!productId) {
    return NextResponse.json({ error: "Missing product id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot — pretend success so bots don't retry.
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const reviewerName = (body.reviewer_name ?? "").trim().slice(0, 80);
  const reviewBody = (body.body ?? "").trim().slice(0, 2000);
  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim().slice(0, 180)
      : null;
  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw)
    ? Math.min(5, Math.max(1, Math.round(ratingRaw)))
    : 0;

  if (!reviewerName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!reviewBody || reviewBody.length < 5) {
    return NextResponse.json(
      { error: "Review text must be at least a few words" },
      { status: 400 }
    );
  }
  if (rating < 1) {
    return NextResponse.json({ error: "Pick a 1–5 star rating" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (prodErr || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("product_reviews")
    .insert({
      product_id: productId,
      reviewer_name: reviewerName,
      email,
      rating,
      body: reviewBody,
      approved: true,
    })
    .select("id, reviewer_name, rating, body, created_at")
    .single();

  if (error) {
    if (/relation|table|does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Reviews table not ready. Run migration 017_product_reviews.sql.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, review: data });
}
