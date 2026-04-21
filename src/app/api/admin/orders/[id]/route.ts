import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderEvent, type OrderEventKind } from "@/lib/orders/events";
import { decrementProductStock } from "@/lib/inventory";

export const runtime = "nodejs";

interface PatchBody {
  action?:
    | "set_notes"
    | "mark_shipped"
    | "update_tracking"
    | "mark_paid"
    | "cancel"
    | "refund";
  notes?: string;
  tracking_number?: string;
  tracking_carrier?: string;
}

export async function PATCH(
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

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = createServiceClient();
  const orderId = params.id;

  const { data: order, error: getErr } = await service
    .from("orders")
    .select("id, product_id, payment_status")
    .eq("id", orderId)
    .single();
  if (getErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const updateWithFallback = async (
    payload: Record<string, unknown>,
    kind: OrderEventKind,
    message: string,
    metadata?: Record<string, unknown>
  ) => {
    // Progressive fallback for installs that haven't migrated.
    let res = await service.from("orders").update(payload).eq("id", orderId);
    let attempt = 0;
    while (
      res.error &&
      /column|does not exist/i.test(res.error.message) &&
      attempt < 6
    ) {
      // Strip the unknown column and retry.
      const match = res.error.message.match(/"([^"]+)"/);
      const col = match?.[1];
      if (!col || !(col in payload)) break;
      delete payload[col];
      res = await service.from("orders").update(payload).eq("id", orderId);
      attempt += 1;
    }
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    await logOrderEvent(service, {
      orderId,
      kind,
      actor: "admin",
      message,
      metadata: { ...(metadata ?? {}), email: user.email ?? null },
    });
    return NextResponse.json({ ok: true });
  };

  switch (body.action) {
    case "set_notes": {
      const notes = body.notes?.trim() ?? "";
      return updateWithFallback(
        { admin_notes: notes || null },
        "note_added",
        notes ? "Admin updated notes" : "Admin cleared notes"
      );
    }
    case "mark_shipped": {
      const now = new Date().toISOString();
      return updateWithFallback(
        {
          shipped_at: now,
          tracking_number: body.tracking_number?.trim() || null,
          tracking_carrier: body.tracking_carrier?.trim() || null,
        },
        "shipped",
        body.tracking_number
          ? `Shipped · ${body.tracking_carrier ?? "tracking"} ${body.tracking_number}`
          : "Marked as shipped",
        {
          tracking_number: body.tracking_number ?? null,
          tracking_carrier: body.tracking_carrier ?? null,
        }
      );
    }
    case "update_tracking": {
      return updateWithFallback(
        {
          tracking_number: body.tracking_number?.trim() || null,
          tracking_carrier: body.tracking_carrier?.trim() || null,
        },
        "tracking_updated",
        `Tracking updated · ${body.tracking_carrier ?? ""} ${body.tracking_number ?? ""}`.trim(),
        {
          tracking_number: body.tracking_number ?? null,
          tracking_carrier: body.tracking_carrier ?? null,
        }
      );
    }
    case "mark_paid": {
      if (order.payment_status === "paid") {
        return NextResponse.json({ ok: true, noop: true });
      }
      const res = await updateWithFallback(
        {
          payment_status: "paid",
          verified_at: new Date().toISOString(),
        },
        "marked_paid",
        "Admin verified payment and marked order paid"
      );
      if (order.product_id) {
        await decrementProductStock(service, order.product_id);
      }
      return res;
    }
    case "cancel": {
      return updateWithFallback(
        { payment_status: "cancelled" },
        "cancelled",
        "Admin cancelled this order"
      );
    }
    case "refund": {
      return updateWithFallback(
        { payment_status: "refunded" },
        "refunded",
        "Admin marked this order refunded"
      );
    }
    default:
      return NextResponse.json(
        { error: "Unknown or missing action" },
        { status: 400 }
      );
  }
}
