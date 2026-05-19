import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buyerInfoOf,
  getPaypalOrder,
  isPaypalConfigured,
  paymentRefAfterPaypalCapture,
  resolvePaypalCaptureAfterApproval,
} from "@/lib/payments/paypal";
import { decrementProductStock } from "@/lib/inventory";
import { logOrderEvent } from "@/lib/orders/events";
import { autoBuyLabelForOrder, isAutoShipEnabled } from "@/lib/shipping/autoship";
import { isShippoConfigured } from "@/lib/shipping/config";
import { validateAddress } from "@/lib/shipping/shippo";
import { hasConcreteShippingAddress } from "@/lib/orders/shipping-address";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capture a PayPal order created via the embedded Smart Buttons SDK.
 *
 * Body: { paypalOrderId: string }
 *
 * On success returns { ok: true, orderId } so the client can route the buyer
 * to the existing /checkout/pending/[orderId] tracking page. Mirrors the
 * exact post-capture side-effects of the legacy redirect return page:
 *   - mark internal order paid + persist capture id
 *   - decrement product stock by ordered qty
 *   - fire-and-forget auto-buy of the shipping label (if configured)
 *   - log a marked_paid order event
 */
export async function POST(request: Request) {
  // Captures are idempotent (we check `payment_status === paid` already), but
  // we still want to stop hammer-the-endpoint scans from costing us PayPal
  // API calls. 30/min/IP is generous for any real user.
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `paypal-capture:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  if (!isPaypalConfigured()) {
    return NextResponse.json(
      { error: "PayPal is not configured." },
      { status: 503 }
    );
  }

  let body: { paypalOrderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const paypalOrderId = body.paypalOrderId?.trim();
  if (!paypalOrderId) {
    return NextResponse.json(
      { error: "paypalOrderId required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Primary lookup: `payment_ref` is the PayPal checkout order id at create
  // time. After a successful capture we may overwrite it with the capture id,
  // so a duplicate `onApprove` still sends the checkout id — fall back to
  // `custom_id` on the PayPal order (our internal UUID).
  const { data: orderFirst, error: lookupErr } = await supabase
    .from("orders")
    .select(
      "id, product_id, payment_status, amount, quantity, payment_ref, shipping_address"
    )
    .eq("payment_ref", paypalOrderId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json(
      { error: "Order lookup failed. Try again in a moment." },
      { status: 500 }
    );
  }

  let order = orderFirst;

  if (!order) {
    const paypalRow = await getPaypalOrder(paypalOrderId).catch(() => null);
    const customId = paypalRow?.purchase_units?.[0]?.custom_id?.trim();
    if (customId) {
      const second = await supabase
        .from("orders")
        .select(
          "id, product_id, payment_status, amount, quantity, payment_ref, shipping_address"
        )
        .eq("id", customId)
        .maybeSingle();
      if (second.error) {
        return NextResponse.json(
          { error: "Order lookup failed. Try again in a moment." },
          { status: 500 }
        );
      }
      order = second.data ?? null;
    }
  }

  if (!order) {
    return NextResponse.json(
      { error: "Order not found for that PayPal token." },
      { status: 404 }
    );
  }

  // Idempotency: already captured → just acknowledge.
  if (order.payment_status === "paid") {
    return NextResponse.json({ ok: true, orderId: order.id, alreadyPaid: true });
  }

  let capture: { id: string; status: string; amount: number; currency: string } | null =
    null;
  let buyerInfo: ReturnType<typeof buyerInfoOf> = null;
  try {
    const resolved = await resolvePaypalCaptureAfterApproval(
      paypalOrderId,
      Number(order.amount) || 0
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 402 });
    }
    capture = resolved.capture;
    buyerInfo = buyerInfoOf(resolved.paypalOrder);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PayPal capture failed";
    await logOrderEvent(supabase, {
      orderId: order.id as string,
      kind: "note_added",
      actor: "system",
      message: `PayPal SDK capture failed: ${msg}`,
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Build the order update — we always mark paid + stamp the capture id;
  // we additionally fill in shipping/customer fields if PayPal handed
  // them back and our row didn't already have them (a crypto pre-fill
  // would have populated these, so we don't overwrite). Progressive
  // fallback strips any columns that don't exist on this schema.
  const updatePayload: Record<string, unknown> = {
    payment_status: "paid",
    payment_ref: paymentRefAfterPaypalCapture(paypalOrderId, capture.id),
    verified_at: new Date().toISOString(),
  };

  const hadAddress = hasConcreteShippingAddress(
    (order as { shipping_address?: string | null }).shipping_address
  );
  let formattedShippingForDisplay = "";
  if (!hadAddress && buyerInfo) {
    const formattedAddress = [
      buyerInfo.name,
      buyerInfo.street1,
      buyerInfo.street2 || null,
      `${buyerInfo.city}, ${buyerInfo.state} ${buyerInfo.zip}`,
      buyerInfo.phone || null,
      buyerInfo.email,
    ]
      .filter(Boolean)
      .join("\n");
    updatePayload.customer_name = buyerInfo.name.slice(0, 80);
    updatePayload.customer_phone = buyerInfo.phone
      ? buyerInfo.phone.slice(0, 32)
      : null;
    updatePayload.email = buyerInfo.email.slice(0, 180);
    updatePayload.shipping_address = formattedAddress;
    formattedShippingForDisplay = formattedAddress;
  } else if (hadAddress) {
    formattedShippingForDisplay = String(
      (order as { shipping_address?: string | null }).shipping_address ?? ""
    );
  }

  let attempts = 0;
  while (attempts < 6) {
    const { error: updErr } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);
    if (!updErr) break;
    if (!/column|does not exist|schema/i.test(updErr.message)) break;
    const m = updErr.message.match(/"([^"]+)"/);
    const col = m?.[1];
    if (!col || !(col in updatePayload)) break;
    delete updatePayload[col];
    attempts += 1;
  }

  await logOrderEvent(supabase, {
    orderId: order.id as string,
    kind: "marked_paid",
    actor: "system",
    message: `PayPal capture ${capture.id} · $${capture.amount.toFixed(2)} ${capture.currency}`,
    metadata: {
      capture_id: capture.id,
      paypal_order_id: paypalOrderId,
      payment_ref_row: paymentRefAfterPaypalCapture(paypalOrderId, capture.id),
      address_source: hadAddress
        ? "pre-collected"
        : buyerInfo
        ? "paypal"
        : "none",
    },
  });

  if (!hadAddress && buyerInfo && isShippoConfigured()) {
    void (async () => {
      try {
        const result = await validateAddress({
          name: buyerInfo.name.slice(0, 80),
          street1: buyerInfo.street1.slice(0, 120),
          street2: buyerInfo.street2 || undefined,
          city: buyerInfo.city.slice(0, 60),
          state: buyerInfo.state,
          zip: buyerInfo.zip.slice(0, 16),
          country: buyerInfo.country,
          phone: buyerInfo.phone || undefined,
          email: buyerInfo.email.slice(0, 180),
        });
        if (result.valid === false) {
          await logOrderEvent(supabase, {
            orderId: order.id as string,
            kind: "note_added",
            actor: "system",
            message: `Post-pay USPS check: ${result.message ?? "address could not be validated"}`,
            metadata: { source: "post_paypal_usps" },
          });
        }
      } catch (err) {
        console.error("[sdk-capture] post-pay USPS check:", err);
      }
    })();
  }

  if (order.product_id) {
    const qty =
      typeof (order as { quantity?: number }).quantity === "number" &&
      (order as { quantity?: number }).quantity! > 0
        ? (order as { quantity?: number }).quantity!
        : 1;
    await decrementProductStock(supabase, order.product_id, qty);
  }

  if (isAutoShipEnabled()) {
    void autoBuyLabelForOrder({ service: supabase, orderId: order.id as string }).catch(
      (err) => console.error("[autoship] sdk capture:", err)
    );
  }

  const shipLines =
    formattedShippingForDisplay.trim() ||
    "Shipping on file — see your confirmation email.";

  const clientVerifyPayload = buyerInfo
    ? {
        name: buyerInfo.name.slice(0, 80),
        street1: buyerInfo.street1.slice(0, 120),
        street2: buyerInfo.street2 || undefined,
        city: buyerInfo.city.slice(0, 60),
        state: buyerInfo.state,
        zip: buyerInfo.zip.slice(0, 16),
        country: buyerInfo.country,
        phone: buyerInfo.phone || undefined,
        email: buyerInfo.email.slice(0, 180),
      }
    : null;

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    alreadyPaid: false,
    postCheckout: {
      shipToDisplay: shipLines.slice(0, 3000),
      clientVerify: clientVerifyPayload,
    },
  });
}
