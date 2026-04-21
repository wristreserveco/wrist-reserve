import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderEvent } from "@/lib/orders/events";
import { decrementProductStock } from "@/lib/inventory";

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
    .select("product_id, payment_status")
    .single();

  if (updateRes.error && /verified_at/.test(updateRes.error.message)) {
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

  if (newStatus === "paid" && order?.product_id) {
    await decrementProductStock(service, order.product_id);
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
