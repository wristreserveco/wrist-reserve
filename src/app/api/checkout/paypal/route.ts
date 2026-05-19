import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProduct } from "@/lib/products";
import { isPaypalConfigured, createPaypalOrder, approveLinkOf } from "@/lib/payments/paypal";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * Initiate a PayPal Checkout.
 *
 * Flow:
 *   1. We create a *pending* row in `orders` so we have an internal id.
 *   2. We hand that id to PayPal as `custom_id` and ask for a CAPTURE order.
 *   3. We return the PayPal `approve` URL — the client redirects there.
 *   4. After payment, PayPal redirects to /checkout/paypal/return?order=<our id>
 *      &token=<paypal id>, where we capture and finalize the order.
 *
 * No card data ever touches our server (PCI-DSS SAQ-A).
 */
export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `paypal-redirect:${ip}`,
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

  let body: { productId?: string; quantity?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }
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

  // Create a pending row first so we have a stable id to round-trip.
  const insertPayload: Record<string, unknown> = {
    product_id: product.id,
    amount: totalAmount,
    quantity,
    payment_method: "paypal",
    payment_status: "pending",
  };
  let orderRes = await supabase
    .from("orders")
    .insert(insertPayload)
    .select("id")
    .single();
  if (
    orderRes.error &&
    /column|quantity|schema|does not exist/i.test(orderRes.error.message)
  ) {
    delete insertPayload.quantity;
    orderRes = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();
  }
  // If the payment_method check constraint hasn't been migrated to allow
  // "paypal" yet, fall back to a generic value so checkout still works.
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
  const orderId = orderRes.data.id;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get("origin") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  try {
    const paypalOrder = await createPaypalOrder({
      orderId,
      amountUsd: totalAmount,
      // No purchase_unit.description — keeps PayPal checkout copy minimal.
      brandName: "Wrist Reserve",
      returnUrl: `${siteUrl}/checkout/paypal/return?order=${orderId}`,
      cancelUrl: `${siteUrl}/checkout/paypal/return?order=${orderId}&cancel=1`,
    });
    const approveUrl = approveLinkOf(paypalOrder);
    if (!approveUrl) throw new Error("PayPal did not return an approval URL");

    // Persist PayPal order id as payment_ref for reconciliation.
    await supabase
      .from("orders")
      .update({ payment_ref: paypalOrder.id })
      .eq("id", orderId);

    return NextResponse.json({ orderId, approveUrl });
  } catch (e) {
    await supabase
      .from("orders")
      .update({ payment_status: "cancelled" })
      .eq("id", orderId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PayPal checkout failed" },
      { status: 502 }
    );
  }
}
