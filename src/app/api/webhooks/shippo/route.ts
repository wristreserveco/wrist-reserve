import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { isShippoConfigured } from "@/lib/shipping/config";
import { verifyShippoSignature } from "@/lib/shipping/shippo";
import { logOrderEvent } from "@/lib/orders/events";

export const runtime = "nodejs";

/**
 * Shippo webhook receiver.
 *
 * Shippo expects a 2XX in <3 seconds. We do the absolute minimum work
 * (one lookup + one update + one event insert) and return immediately.
 *
 * Supported events (matched against `event` field):
 *   - track_updated         → updates `tracking_status` on the matching order
 *   - transaction_created   → if Shippo creates a label outside our admin flow
 *                             (e.g. in their dashboard), we reconcile it onto
 *                             whichever order has the matching tracking #
 *   - transaction_updated   → carrier-side label changes (rare)
 *
 * Anything else is ack'd and ignored so Shippo stops retrying.
 */
export async function POST(request: Request) {
  // Loud, easy-to-grep log line so we can confirm Shippo's "Send sample"
  // button (and real events) actually reach our function. Visible in
  // Vercel runtime logs and `vercel logs` CLI output.
  console.log("[shippo-webhook] hit", {
    ua: request.headers.get("user-agent"),
    sig: request.headers.get("shippo-signature") ? "present" : "missing",
  });

  if (!isShippoConfigured()) {
    console.warn("[shippo-webhook] not configured — returning 503");
    return NextResponse.json({ error: "Shippo not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const sig = (await headers()).get("shippo-signature") ?? null;

  // Signature is enforced only once SHIPPO_WEBHOOK_SECRET is set, so first-run
  // testing without a secret keeps working.
  if (process.env.SHIPPO_WEBHOOK_SECRET) {
    if (!verifyShippoSignature(raw, sig)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }
  }

  let payload: ShippoWebhookPayload;
  try {
    payload = JSON.parse(raw) as ShippoWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[shippo-webhook] event", payload.event);

  switch (payload.event) {
    case "track_updated":
      return handleTrackUpdated(payload as TrackUpdatedPayload);
    case "transaction_created":
    case "transaction_updated":
      return handleTransactionEvent(payload as TransactionPayload);
    default:
      return NextResponse.json({ ok: true, ignored: payload.event });
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleTrackUpdated(payload: TrackUpdatedPayload) {
  const trackingNumber = payload.data?.tracking_number;
  const status = payload.data?.tracking_status?.status;
  if (!trackingNumber || !status) {
    return NextResponse.json({ ok: true, ignored: "missing tracking data" });
  }

  const service = createServiceClient();
  const order = await findOrderByTracking(service, trackingNumber);
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "no matching order" });
  }

  await service
    .from("orders")
    .update({ tracking_status: status })
    .eq("id", order.id);

  await logOrderEvent(service, {
    orderId: order.id,
    kind: "tracking_updated",
    actor: "system",
    message: `Carrier update · ${humanize(status)}`,
    metadata: {
      carrier: payload.data?.carrier ?? null,
      status,
      status_details: payload.data?.tracking_status?.status_details ?? null,
      eta: payload.data?.eta ?? null,
      location: payload.data?.tracking_status?.location ?? null,
    },
  });

  return NextResponse.json({ ok: true, order_id: order.id, status });
}

async function handleTransactionEvent(payload: TransactionPayload) {
  // We mostly create labels via our own admin API, so this fires when the
  // user (or Shippo's auto-flow) creates a label outside the app. Reconcile
  // by tracking number.
  const trackingNumber = payload.data?.tracking_number;
  if (!trackingNumber) {
    return NextResponse.json({ ok: true, ignored: "no tracking number" });
  }

  const service = createServiceClient();
  const order = await findOrderByTracking(service, trackingNumber);
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "no matching order" });
  }

  // Patch in any label info we don't already have.
  const update: Record<string, unknown> = {};
  if (payload.data?.label_url) update.shippo_label_url = payload.data.label_url;
  if (payload.data?.tracking_url_provider)
    update.tracking_url = payload.data.tracking_url_provider;
  if (payload.data?.tracking_status)
    update.tracking_status = payload.data.tracking_status;
  if (payload.data?.object_id) update.shippo_transaction_id = payload.data.object_id;

  if (Object.keys(update).length > 0) {
    let res = await service.from("orders").update(update).eq("id", order.id);
    let attempts = 0;
    while (res.error && /column|does not exist/i.test(res.error.message) && attempts < 6) {
      const m = res.error.message.match(/"([^"]+)"/);
      const col = m?.[1];
      if (!col || !(col in update)) break;
      delete update[col];
      res = await service.from("orders").update(update).eq("id", order.id);
      attempts += 1;
    }
  }

  return NextResponse.json({ ok: true, order_id: order.id, event: payload.event });
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function findOrderByTracking(
  service: ReturnType<typeof createServiceClient>,
  trackingNumber: string
) {
  const { data } = await service
    .from("orders")
    .select("id")
    .eq("tracking_number", trackingNumber)
    .maybeSingle();
  return data as { id: string } | null;
}

function humanize(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

// ─── Payload types (matching docs.goshippo.com/Tracking/Webhooks) ──────

interface ShippoBaseEvent {
  event: string;
  test?: boolean;
}

interface TrackingStatus {
  status?: string;
  status_details?: string;
  status_date?: string;
  substatus?: { code?: string; text?: string; action_required?: boolean };
  location?: { city?: string; state?: string; zip?: string; country?: string };
  object_id?: string;
}

interface TrackUpdatedPayload extends ShippoBaseEvent {
  event: "track_updated";
  data: {
    carrier?: string;
    tracking_number?: string;
    tracking_status?: TrackingStatus;
    eta?: string;
    original_eta?: string;
    transaction?: string;
  };
}

interface TransactionPayload extends ShippoBaseEvent {
  event: "transaction_created" | "transaction_updated";
  data: {
    object_id?: string;
    object_state?: "VALID" | "INVALID";
    status?: string;
    tracking_number?: string;
    tracking_status?: string; // top-level string on transaction events
    tracking_url_provider?: string;
    label_url?: string;
    rate?: { provider?: string; servicelevel_name?: string };
  };
}

type ShippoWebhookPayload =
  | TrackUpdatedPayload
  | TransactionPayload
  | (ShippoBaseEvent & { data?: unknown });
