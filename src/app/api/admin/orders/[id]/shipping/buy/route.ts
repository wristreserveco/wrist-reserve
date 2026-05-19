import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { purchaseLabel } from "@/lib/shipping/shippo";
import { isShippoConfigured } from "@/lib/shipping/config";
import { logOrderEvent } from "@/lib/orders/events";
import { logAuditEvent, auditContextFromRequest } from "@/lib/security/audit-log";

export const runtime = "nodejs";

interface Body {
  rate_id: string;
  declared_value_usd?: number;
  signature_required?: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isShippoConfigured()) {
    return NextResponse.json(
      { error: "Shippo isn't configured yet." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.rate_id) {
    return NextResponse.json({ error: "rate_id is required" }, { status: 400 });
  }

  const service = createServiceClient();
  const orderId = params.id;
  const { data: order } = await service
    .from("orders")
    .select("id, amount")
    .eq("id", orderId)
    .single();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const declared =
    typeof body.declared_value_usd === "number" && body.declared_value_usd > 0
      ? body.declared_value_usd
      : Number(order.amount) || undefined;

  let tx;
  try {
    tx = await purchaseLabel({
      rateId: body.rate_id,
      declaredValueUsd: declared,
      signatureRequired: body.signature_required,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to buy label";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persist the bought label on the order. Tolerate missing columns so the
  // route works even if migration 019 hasn't been run yet on this install.
  const payload: Record<string, unknown> = {
    shippo_label_url: tx.label_url ?? null,
    shippo_transaction_id: tx.object_id,
    shippo_rate_id: body.rate_id,
    tracking_number: tx.tracking_number ?? null,
    tracking_carrier: tx.tracking_url_provider ? extractCarrier(tx.tracking_url_provider) : null,
    tracking_url: tx.tracking_url_provider ?? null,
    tracking_status: tx.tracking_status ?? "PRE_TRANSIT",
    shipped_at: new Date().toISOString(),
  };

  let res = await service.from("orders").update(payload).eq("id", orderId);
  let attempts = 0;
  while (res.error && /column|does not exist/i.test(res.error.message) && attempts < 8) {
    const m = res.error.message.match(/"([^"]+)"/);
    const col = m?.[1];
    if (!col || !(col in payload)) break;
    delete payload[col];
    res = await service.from("orders").update(payload).eq("id", orderId);
    attempts += 1;
  }
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  await logOrderEvent(service, {
    orderId,
    kind: "shipped",
    actor: "admin",
    message: `Label purchased · ${tx.tracking_number ?? "no tracking yet"}`,
    metadata: {
      label_url: tx.label_url ?? null,
      transaction_id: tx.object_id,
      tracking_number: tx.tracking_number ?? null,
      email: user.email ?? null,
    },
  });

  await logAuditEvent({
    service,
    ...auditContextFromRequest(request, user),
    kind: "order.label_purchase",
    targetKind: "order",
    targetId: orderId,
    message: `Purchased shipping label for order ${orderId}`,
    metadata: {
      transaction_id: tx.object_id,
      tracking_number: tx.tracking_number ?? null,
      rate_id: body.rate_id,
    },
  });

  return NextResponse.json({
    ok: true,
    label_url: tx.label_url,
    tracking_number: tx.tracking_number,
    tracking_url: tx.tracking_url_provider,
  });
}

/** Extract a coarse carrier label from Shippo's tracking URL — best-effort. */
function extractCarrier(trackingUrl: string): string | null {
  const u = trackingUrl.toLowerCase();
  if (u.includes("usps")) return "USPS";
  if (u.includes("ups.com")) return "UPS";
  if (u.includes("fedex")) return "FedEx";
  if (u.includes("dhl")) return "DHL";
  return null;
}
