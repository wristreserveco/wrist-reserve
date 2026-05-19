import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { makeMemoCode } from "@/lib/orders/memo";
import { formatPrice } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public order status. Used by the buyer-facing pending page to poll for
 * payment confirmation + tracking updates.
 *
 * Returns no manual-payment instructions because we no longer accept manual
 * (Zelle / Cash App / wire / Square / Apple Cash) flows — only PayPal and
 * Crypto, both of which redirect away to a hosted page for the actual
 * payment step.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  let { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, amount, payment_method, payment_status, payment_ref, customer_name, shipped_at, tracking_number, tracking_carrier, tracking_url, tracking_status, created_at"
    )
    .eq("id", params.id)
    .single();

  // Tolerate older installs missing the shipping/tracking columns.
  if (error && /tracking_|shipped_at/.test(error.message)) {
    const fallback = await supabase
      .from("orders")
      .select(
        "id, product_id, amount, payment_method, payment_status, payment_ref, customer_name, created_at"
      )
      .eq("id", params.id)
      .single();
    order = fallback.data as typeof order;
    error = fallback.error ?? null;
  }

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: product } = order.product_id
    ? await supabase
        .from("products")
        .select("name")
        .eq("id", order.product_id)
        .single()
    : { data: null };

  const amount = Number(order.amount);

  // Pull recent timeline events (best-effort).
  let events: Array<{
    id: string;
    kind: string;
    message: string | null;
    actor: string;
    created_at: string;
  }> = [];
  try {
    const { data: evRows } = await supabase
      .from("order_events")
      .select("id, kind, message, actor, created_at")
      .eq("order_id", params.id)
      .order("created_at", { ascending: true })
      .limit(30);
    events = (evRows ?? []) as typeof events;
  } catch {
    events = [];
  }

  return NextResponse.json({
    id: order.id,
    status: order.payment_status,
    method: order.payment_method,
    amount,
    amountDisplay: formatPrice(amount),
    memo: makeMemoCode(order.id),
    productName: product?.name ?? null,
    customerName: order.customer_name,
    trackingNumber:
      typeof (order as Record<string, unknown>).tracking_number === "string"
        ? ((order as Record<string, unknown>).tracking_number as string)
        : null,
    trackingCarrier:
      typeof (order as Record<string, unknown>).tracking_carrier === "string"
        ? ((order as Record<string, unknown>).tracking_carrier as string)
        : null,
    trackingUrl:
      typeof (order as Record<string, unknown>).tracking_url === "string"
        ? ((order as Record<string, unknown>).tracking_url as string)
        : null,
    trackingStatus:
      typeof (order as Record<string, unknown>).tracking_status === "string"
        ? ((order as Record<string, unknown>).tracking_status as string)
        : null,
    shippedAt:
      typeof (order as Record<string, unknown>).shipped_at === "string"
        ? ((order as Record<string, unknown>).shipped_at as string)
        : null,
    events,
  });
}
