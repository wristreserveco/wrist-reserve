import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProduct } from "@/lib/products";
import { isPaypalConfigured, createPaypalOrder } from "@/lib/payments/paypal";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a PayPal order for the embedded Smart Buttons SDK flow.
 *
 * Unlike the redirect-style /api/checkout/paypal endpoint, this returns just
 * the PayPal order id — the SDK takes over from there and handles approval
 * inside a popup. Capture happens via /api/checkout/paypal/sdk-capture.
 *
 * Why a separate endpoint:
 *   - the SDK contract expects only `{ id }` in the response.
 *   - keeps the legacy redirect path untouched as a fallback.
 *   - lets us tighten validation around exactly the JS-SDK flow.
 *
 * Shipping is optional for PayPal: when omitted, PayPal collects the ship-to
 * (GET_FROM_FILE) and we persist it at capture from PayPal’s response. When
 * the client sends a verified address, we pass SET_PROVIDED_ADDRESS so the
 * buyer sees the same line they confirmed on our site.
 */
export async function POST(request: Request) {
  // 20 PayPal-order creations per IP per minute is well above any legit
  // shopper's behavior and stops basic order-flood DoS attempts cold.
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `paypal-create:${ip}`,
    limit: 20,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  if (!isPaypalConfigured()) {
    return NextResponse.json(
      { error: "PayPal is not configured yet." },
      { status: 503 }
    );
  }

  let body: {
    productId?: string;
    quantity?: number;
    shipping?: {
      name?: string;
      street1?: string;
      street2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const ship = body.shipping;
  const hasFullShipping = Boolean(
    ship?.name?.trim() &&
      ship?.street1?.trim() &&
      ship?.city?.trim() &&
      ship?.state?.trim() &&
      ship?.zip?.trim() &&
      ship?.email?.trim()
  );
  const requestedQty =
    Number.isFinite(body.quantity) && body.quantity! > 0
      ? Math.floor(body.quantity!)
      : 1;

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = mapProduct(row as Record<string, unknown>);
  if (product.hidden) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (product.status !== "available" || product.quantity <= 0) {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }
  const quantity = Math.min(requestedQty, product.quantity);
  if (quantity < 1) {
    return NextResponse.json({ error: "Out of stock" }, { status: 400 });
  }
  const totalAmount = Number((product.price * quantity).toFixed(2));

  const insertPayload: Record<string, unknown> = {
    product_id: product.id,
    amount: totalAmount,
    quantity,
    payment_method: "paypal",
    payment_status: "pending",
  };

  if (hasFullShipping) {
    const s = ship!;
    insertPayload.customer_name = s.name!.trim().slice(0, 80);
    insertPayload.customer_phone = s.phone?.trim().slice(0, 32) || null;
    insertPayload.email = s.email!.trim().slice(0, 180);
    insertPayload.shipping_address = [
      s.name!.trim(),
      s.street1!.trim(),
      s.street2?.trim() || null,
      `${s.city!.trim()}, ${s.state!.trim()} ${s.zip!.trim()}`,
      s.phone?.trim() || null,
      s.email!.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    insertPayload.customer_name = "Pending checkout";
    insertPayload.customer_phone = null;
    insertPayload.email = `${randomUUID()}@checkout.pending.wristreserve`;
    insertPayload.shipping_address =
      "Ship-to will be taken from PayPal after you approve payment.";
  }
  // Progressive fallback: if any column doesn't exist on this install of
  // the schema, strip it and retry. The structured shipping fields are
  // less critical than the order itself, so this lets us ship even on
  // partially-migrated databases.
  let orderRes = await supabase
    .from("orders")
    .insert(insertPayload)
    .select("id")
    .single();
  let attempts = 0;
  while (
    orderRes.error &&
    /column|does not exist|schema/i.test(orderRes.error.message) &&
    attempts < 8
  ) {
    const match = orderRes.error.message.match(/"([^"]+)"/);
    const col = match?.[1];
    if (!col || !(col in insertPayload)) break;
    delete insertPayload[col];
    orderRes = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();
    attempts += 1;
  }
  if (
    orderRes.error &&
    /payment_method|check constraint/i.test(orderRes.error.message)
  ) {
    insertPayload.payment_method = "crypto";
    orderRes = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();
  }
  if (orderRes.error || !orderRes.data) {
    return NextResponse.json(
      {
        error: orderRes.error?.message
          ? `Failed to create order: ${orderRes.error.message}`
          : "Failed to create order",
      },
      { status: 500 }
    );
  }
  const orderId = orderRes.data.id as string;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get("origin") ||
    "https://www.wristreserve.co"
  ).replace(/\/$/, "");

  try {
    const paypalOrder = await createPaypalOrder({
      orderId,
      amountUsd: totalAmount,
      brandName: "Wrist Reserve",
      returnUrl: `${siteUrl}/checkout/paypal/return?order=${orderId}`,
      cancelUrl: `${siteUrl}/checkout/paypal/return?order=${orderId}&cancel=1`,
      ...(hasFullShipping
        ? {
            shipping: {
              name: ship!.name!.trim(),
              street1: ship!.street1!.trim(),
              street2: ship!.street2?.trim() || null,
              city: ship!.city!.trim(),
              state: ship!.state!.trim().toUpperCase(),
              zip: ship!.zip!.trim(),
              country: ship!.country?.trim().toUpperCase() || "US",
              phone: ship!.phone?.trim() || null,
              email: ship!.email!.trim(),
            },
          }
        : {}),
    });

    await supabase
      .from("orders")
      .update({ payment_ref: paypalOrder.id })
      .eq("id", orderId);

    return NextResponse.json({ id: paypalOrder.id, orderId });
  } catch (e) {
    await supabase
      .from("orders")
      .update({ payment_status: "cancelled" })
      .eq("id", orderId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PayPal order create failed" },
      { status: 502 }
    );
  }
}
