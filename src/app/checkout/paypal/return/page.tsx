import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buyerInfoOf,
  isPaypalConfigured,
  paymentRefAfterPaypalCapture,
  resolvePaypalCaptureAfterApproval,
} from "@/lib/payments/paypal";
import { decrementProductStock } from "@/lib/inventory";
import { logOrderEvent } from "@/lib/orders/events";
import { autoBuyLabelForOrder, isAutoShipEnabled } from "@/lib/shipping/autoship";
import { hasConcreteShippingAddress } from "@/lib/orders/shipping-address";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SearchParams {
  /** Our internal order id (set by us in return_url). */
  order?: string;
  /** PayPal-supplied order id (token=...). */
  token?: string;
  /** PayPal payer id (PayerID=...). */
  PayerID?: string;
  /** Set when PayPal redirected to cancel_url instead of return_url. */
  cancel?: string;
}

/**
 * Server-side capture page. PayPal redirects here after the buyer approves
 * (or cancels) the payment. We:
 *   1. Look up our pending order
 *   2. Call /v2/checkout/orders/{id}/capture
 *   3. Mark the order paid + decrement stock + auto-ship if configured
 *   4. Redirect the buyer to the existing pending/tracking page
 *
 * Any failures land on a clean error screen with a link back to the product.
 */
export default async function PaypalReturnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const sp = (await Promise.resolve(searchParams)) as SearchParams;
  const orderId = sp.order?.trim();
  const paypalToken = sp.token?.trim();

  if (!orderId) return <ErrorScreen message="Missing order reference." />;
  if (!isPaypalConfigured()) {
    return <ErrorScreen message="PayPal is not configured." />;
  }

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, payment_status, amount, quantity, payment_ref, shipping_address"
    )
    .eq("id", orderId)
    .single();
  if (error || !order) {
    return <ErrorScreen message="Order not found." />;
  }

  // If the buyer hit cancel on PayPal's hosted page, mark the order cancelled
  // so we don't leave it dangling pending forever.
  if (sp.cancel === "1") {
    if (order.payment_status === "pending") {
      await supabase
        .from("orders")
        .update({ payment_status: "cancelled" })
        .eq("id", orderId);
      await logOrderEvent(supabase, {
        orderId,
        kind: "cancelled",
        actor: "buyer",
        message: "Buyer cancelled PayPal checkout.",
      });
    }
    redirect(`/products/${order.product_id ?? ""}?cancelled=1`);
  }

  // Idempotency: already paid → just send them to tracking.
  if (order.payment_status === "paid") {
    redirect(`/checkout/pending/${orderId}?paid=1`);
  }

  const paypalOrderId = paypalToken || (order.payment_ref as string | null);
  if (!paypalOrderId) {
    return <ErrorScreen message="Missing PayPal token." />;
  }

  const resolved = await resolvePaypalCaptureAfterApproval(
    paypalOrderId,
    Number(order.amount) || 0
  );
  if (!resolved.ok) {
    await logOrderEvent(supabase, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: `PayPal return capture unresolved: ${resolved.error}`,
    });
    return <ErrorScreen message={resolved.error} />;
  }

  const { capture } = resolved;
  const buyerInfo = buyerInfoOf(resolved.paypalOrder);
  const hadAddress = hasConcreteShippingAddress(
    (order as { shipping_address?: string | null }).shipping_address
  );

  const updateRow: Record<string, unknown> = {
    payment_status: "paid",
    payment_ref: paymentRefAfterPaypalCapture(paypalOrderId, capture.id),
    verified_at: new Date().toISOString(),
  };

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
    updateRow.customer_name = buyerInfo.name.slice(0, 80);
    updateRow.customer_phone = buyerInfo.phone
      ? buyerInfo.phone.slice(0, 32)
      : null;
    updateRow.email = buyerInfo.email.slice(0, 180);
    updateRow.shipping_address = formattedAddress;
  }

  let attempts = 0;
  while (attempts < 6) {
    const { error: updErr } = await supabase
      .from("orders")
      .update(updateRow)
      .eq("id", orderId);
    if (!updErr) break;
    if (!/column|does not exist|schema/i.test(updErr.message)) break;
    const m = updErr.message.match(/"([^"]+)"/);
    const col = m?.[1];
    if (!col || !(col in updateRow)) break;
    delete updateRow[col];
    attempts += 1;
  }

  await logOrderEvent(supabase, {
    orderId,
    kind: "marked_paid",
    actor: "system",
    message: `PayPal capture ${capture.id} · $${capture.amount.toFixed(2)} ${capture.currency}`,
    metadata: {
      capture_id: capture.id,
      paypal_order_id: paypalOrderId,
      payment_ref_row: paymentRefAfterPaypalCapture(paypalOrderId, capture.id),
    },
  });

  if (order.product_id) {
    const qty =
      typeof (order as { quantity?: number }).quantity === "number" &&
      (order as { quantity?: number }).quantity! > 0
        ? (order as { quantity?: number }).quantity!
        : 1;
    await decrementProductStock(supabase, order.product_id, qty);
  }

  // Fire-and-forget auto label purchase (best-effort, never blocks).
  if (isAutoShipEnabled()) {
    void autoBuyLabelForOrder({ service: supabase, orderId }).catch((err) =>
      console.error("[autoship] paypal return:", err)
    );
  }

  redirect(`/checkout/pending/${orderId}?paid=1`);
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
        Payment status
      </p>
      <h1 className="mt-3 font-display text-3xl text-white">Something went wrong</h1>
      <p className="mt-4 text-sm text-white/60">{message}</p>
      <Link
        href="/shop"
        className="mt-10 inline-block rounded-sm border border-white/15 px-8 py-3 text-xs uppercase tracking-[0.25em] text-white transition hover:border-gold-500/40 hover:text-gold-100"
      >
        Back to collection
      </Link>
    </div>
  );
}
