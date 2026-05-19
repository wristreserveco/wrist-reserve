import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isPaypalConfigured,
  verifyPaypalWebhook,
  type PaypalWebhookEvent,
} from "@/lib/payments/paypal";
import { logOrderEvent } from "@/lib/orders/events";
import { decrementProductStock } from "@/lib/inventory";
import { autoBuyLabelForOrder, isAutoShipEnabled } from "@/lib/shipping/autoship";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayPal webhook handler.
 *
 * The capture happens server-side on /checkout/paypal/return, so this
 * endpoint is primarily a safety-net for cases where the buyer closes the
 * browser before the return page finishes (e.g. lost wifi). All paths are
 * idempotent — paying twice should not double-decrement stock.
 *
 * Subscribe in the PayPal portal to at least:
 *   - PAYMENT.CAPTURE.COMPLETED
 *   - PAYMENT.CAPTURE.DENIED
 *   - PAYMENT.CAPTURE.REFUNDED
 *   - CHECKOUT.ORDER.APPROVED (optional — informational)
 *
 * Verification uses PayPal's official /v1/notifications/verify-webhook-signature
 * endpoint (requires PAYPAL_WEBHOOK_ID).
 */
export async function POST(request: Request) {
  console.log("[paypal-webhook] hit", {
    ua: request.headers.get("user-agent"),
    transmissionId: request.headers.get("paypal-transmission-id"),
  });

  if (!isPaypalConfigured()) {
    return NextResponse.json({ error: "PayPal not configured" }, { status: 503 });
  }
  const raw = await request.text();

  // Verify signature against PayPal's signing service. We only enforce when
  // PAYPAL_WEBHOOK_ID is set so initial dev/testing isn't blocked.
  if (process.env.PAYPAL_WEBHOOK_ID) {
    const ok = await verifyPaypalWebhook({
      headers: request.headers,
      rawBody: raw,
    });
    if (!ok) {
      console.warn("[paypal-webhook] signature verification failed");
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }
  }

  let event: PaypalWebhookEvent;
  try {
    event = JSON.parse(raw) as PaypalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[paypal-webhook] event", event.event_type);

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED":
      return handleCaptureCompleted(event);
    case "PAYMENT.CAPTURE.DENIED":
      return handleCaptureDenied(event);
    case "PAYMENT.CAPTURE.REFUNDED":
      return handleCaptureRefunded(event);
    default:
      return NextResponse.json({ ok: true, ignored: event.event_type });
  }
}

/** Pull the original Wrist Reserve order id off either custom_id or the
 *  parent order via supplementary_data. */
function ourOrderIdFrom(event: PaypalWebhookEvent): string | null {
  return (
    event.resource.custom_id ??
    event.resource.supplementary_data?.related_ids?.order_id ??
    null
  );
}

async function handleCaptureCompleted(event: PaypalWebhookEvent) {
  const orderId = ourOrderIdFrom(event);
  const captureId = event.resource.id;
  if (!orderId) {
    return NextResponse.json({ ok: true, ignored: "no custom_id" });
  }

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, payment_status, product_id, quantity")
    .eq("id", orderId)
    .single();
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "order not found" });
  }
  // Idempotency: skip if already paid (return page beat us).
  if (order.payment_status === "paid") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      payment_ref: captureId ?? order.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await logOrderEvent(supabase, {
    orderId,
    kind: "marked_paid",
    actor: "system",
    message: `PayPal webhook capture ${captureId ?? "?"}`,
    metadata: { capture_id: captureId, source: "webhook" },
  });

  if (order.product_id) {
    const qty =
      typeof (order as { quantity?: number }).quantity === "number" &&
      (order as { quantity?: number }).quantity! > 0
        ? (order as { quantity?: number }).quantity!
        : 1;
    await decrementProductStock(supabase, order.product_id, qty);
  }

  if (isAutoShipEnabled()) {
    void autoBuyLabelForOrder({ service: supabase, orderId }).catch((err) =>
      console.error("[autoship] paypal webhook:", err)
    );
  }

  return NextResponse.json({ ok: true });
}

async function handleCaptureDenied(event: PaypalWebhookEvent) {
  const orderId = ourOrderIdFrom(event);
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no custom_id" });

  const supabase = createServiceClient();
  await supabase
    .from("orders")
    .update({ payment_status: "cancelled" })
    .eq("id", orderId)
    .eq("payment_status", "pending");
  await logOrderEvent(supabase, {
    orderId,
    kind: "cancelled",
    actor: "system",
    message: "PayPal capture denied.",
  });
  return NextResponse.json({ ok: true });
}

async function handleCaptureRefunded(event: PaypalWebhookEvent) {
  const orderId = ourOrderIdFrom(event);
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no custom_id" });

  const supabase = createServiceClient();
  await supabase
    .from("orders")
    .update({ payment_status: "refunded" })
    .eq("id", orderId);
  await logOrderEvent(supabase, {
    orderId,
    kind: "refunded",
    actor: "system",
    message: "PayPal refund processed.",
  });
  return NextResponse.json({ ok: true });
}
