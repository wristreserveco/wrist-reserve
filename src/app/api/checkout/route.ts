import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { mapProduct } from "@/lib/products";
import { isStripeConfigured } from "@/lib/env";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Card payments not configured" },
      { status: 503 }
    );
  }
  let body: { productId?: string };
  try {
    body = (await request.json()) as { productId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = mapProduct(row as Record<string, unknown>);
  if (product.status !== "available" || product.quantity <= 0) {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get("origin") ||
    "http://localhost:3000";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(product.price * 100),
          product_data: {
            name: product.name,
            images: (product.media_urls ?? []).slice(0, 1),
            metadata: { product_id: product.id },
          },
        },
      },
    ],
    success_url: `${siteUrl.replace(/\/$/, "")}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl.replace(/\/$/, "")}/products/${product.id}`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    phone_number_collection: { enabled: true },
    customer_creation: "always",
    shipping_address_collection: {
      allowed_countries: [
        "US", "CA", "GB", "AU", "NZ", "IE",
        "DE", "FR", "IT", "ES", "NL", "BE", "LU", "PT", "AT", "CH",
        "SE", "DK", "NO", "FI", "IS",
        "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT",
        "SG", "HK", "JP", "KR", "TW", "TH", "MY", "PH", "ID", "VN",
        "AE", "SA", "QA", "KW", "BH", "OM",
        "ZA", "IL", "TR",
        "MX", "BR", "CL", "AR", "CO", "PE", "UY",
      ],
    },
    metadata: {
      product_id: product.id,
    },
    payment_intent_data: {
      description: product.name,
      metadata: {
        product_id: product.id,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
