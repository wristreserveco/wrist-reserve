import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderEvent } from "@/lib/orders/events";
import { decrementProductStock } from "@/lib/inventory";
import { autoBuyLabelForOrder, isAutoShipEnabled } from "@/lib/shipping/autoship";
import { logAuditEvent, auditContextFromRequest } from "@/lib/security/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderId?: string; markPaid?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = body.orderId?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const service = createServiceClient();
  const newStatus = body.markPaid === false ? "cancelled" : "paid";

  // Try to stamp verified_at too; fall back gracefully if column missing.
  const basePayload: Record<string, unknown> = { payment_status: newStatus };
  if (newStatus === "paid") basePayload.verified_at = new Date().toISOString();

  let updateRes = await service
    .from("orders")
    .update(basePayload)
    .eq("id", orderId)
    .select("product_id, payment_status, quantity")
    .single();

  if (updateRes.error && /verified_at/.test(updateRes.error.message)) {
    updateRes = await service
      .from("orders")
      .update({ payment_status: newStatus })
      .eq("id", orderId)
      .select("product_id, payment_status, quantity")
      .single();
  }
  // Older schema may lack `quantity` — re-select minimal columns.
  if (
    updateRes.error &&
    /column|quantity|does not exist/i.test(updateRes.error.message)
  ) {
    updateRes = await service
      .from("orders")
      .update({ payment_status: newStatus })
      .eq("id", orderId)
      .select("product_id, payment_status")
      .single();
  }

  const { data: order, error } = updateRes;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logOrderEvent(service, {
    orderId,
    kind: newStatus === "paid" ? "marked_paid" : "cancelled",
    actor: "admin",
    message:
      newStatus === "paid"
        ? "Admin verified payment and marked order paid"
        : "Admin cancelled this order",
    metadata: { email: user.email ?? null },
  });

  await logAuditEvent({
    service,
    ...auditContextFromRequest(request, user),
    kind: newStatus === "paid" ? "order.mark_paid" : "order.cancel",
    targetKind: "order",
    targetId: orderId,
    message:
      newStatus === "paid"
        ? `Marked order ${orderId} as paid`
        : `Cancelled order ${orderId}`,
  });

  if (newStatus === "paid" && order?.product_id) {
    const qty =
      typeof (order as { quantity?: number }).quantity === "number" &&
      (order as { quantity?: number }).quantity! > 0
        ? (order as { quantity?: number }).quantity!
        : 1;
    await decrementProductStock(service, order.product_id, qty);

    // Fire-and-forget auto label purchase. Never blocks the admin response —
    // results land in order_events so the timeline tells the story.
    if (isAutoShipEnabled()) {
      void autoBuyLabelForOrder({ service, orderId }).catch((err) => {
        console.error("[autoship] mark-paid handler:", err);
      });
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
