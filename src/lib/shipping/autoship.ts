/**
 * Auto-purchase a Shippo label as soon as an order goes paid.
 *
 * Toggled via env:
 *   SHIPPO_AUTO_BUY=true               enable
 *   SHIPPO_AUTO_BUY_MAX_USD=50         skip if cheapest rate above this cap
 *   SHIPPO_AUTO_BUY_PREFERRED_CARRIER=usps   (optional) prefer this carrier
 *
 * Always:
 *   - non-fatal: failures are logged to order_events but never throw
 *   - idempotent: skips if order already has a tracking number
 *   - safe: requires a usable shipping address; otherwise skips & logs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRates, purchaseLabel, type ShippoAddress } from "./shippo";
import { logOrderEvent } from "@/lib/orders/events";

interface AutoShipOpts {
  service: SupabaseClient;
  orderId: string;
}

/**
 * DEPRECATED: auto-buy is permanently disabled.
 *
 * The owner runs a fully manual fulfilment workflow now — labels are
 * purchased by hand on Shippo/UPS/USPS and the tracking is entered through
 * the admin "Send tracking" panel. We keep this function (always returning
 * false) so any old call sites are short-circuited without breaking the
 * build, and we leave the env vars unused so they can be re-enabled in the
 * future by removing this override.
 */
export function isAutoShipEnabled(): boolean {
  return false;
}

function autoBuyMaxUsd(): number | null {
  const raw = process.env.SHIPPO_AUTO_BUY_MAX_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function preferredCarrier(): string | null {
  const v = (process.env.SHIPPO_AUTO_BUY_PREFERRED_CARRIER ?? "").trim().toUpperCase();
  return v || null;
}

/**
 * Best-effort auto label. Returns true if label was purchased.
 * Never throws — all errors are logged to order_events.
 */
export async function autoBuyLabelForOrder(opts: AutoShipOpts): Promise<boolean> {
  const { service, orderId } = opts;
  if (!isAutoShipEnabled()) return false;

  // Pull the order with shipping/tracking columns (tolerant if migration 019
  // hasn't been applied yet — we just won't auto-ship in that case).
  const { data: order, error } = await service
    .from("orders")
    .select(
      "id, amount, customer_name, customer_phone, email, shipping_address, tracking_number, shippo_label_url, quantity"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) return false;

  // Idempotency: never re-buy a label.
  if (order.tracking_number || order.shippo_label_url) return false;

  const recipient = parseShippingAddress(
    (order as { shipping_address: string | null }).shipping_address ?? null,
    (order as { customer_name: string | null }).customer_name ?? null,
    (order as { customer_phone: string | null }).customer_phone ?? null,
    (order as { email: string | null }).email ?? null
  );

  if (!recipient.street1 || !recipient.city || !recipient.zip || !recipient.state) {
    await logOrderEvent(service, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: "Auto-ship skipped: incomplete shipping address.",
    });
    return false;
  }

  const qty =
    typeof (order as { quantity?: number }).quantity === "number"
      ? Math.max(1, (order as { quantity?: number }).quantity!)
      : 1;

  // 1. Get rates
  let rates;
  try {
    const r = await fetchRates({ to: recipient, quantity: qty });
    rates = r.rates;
  } catch (err) {
    await logOrderEvent(service, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: `Auto-ship: rate fetch failed — ${err instanceof Error ? err.message : "unknown"}`,
    });
    return false;
  }

  if (!rates || rates.length === 0) {
    await logOrderEvent(service, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: "Auto-ship: no shipping rates returned.",
    });
    return false;
  }

  // 2. Pick the cheapest, preferring the configured carrier when present.
  const pref = preferredCarrier();
  const candidate =
    (pref ? rates.find((r) => r.provider.toUpperCase() === pref) : null) ?? rates[0];

  // 3. Cap on max spend
  const cap = autoBuyMaxUsd();
  const rateAmount = Number(candidate.amount);
  if (cap != null && rateAmount > cap) {
    await logOrderEvent(service, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: `Auto-ship: cheapest rate $${candidate.amount} exceeds cap $${cap.toFixed(2)}. Awaiting manual review.`,
      metadata: { rate_id: candidate.object_id, provider: candidate.provider },
    });
    return false;
  }

  // 4. Buy the label
  let tx;
  try {
    tx = await purchaseLabel({
      rateId: candidate.object_id,
      declaredValueUsd: Number(order.amount) || undefined,
    });
  } catch (err) {
    await logOrderEvent(service, {
      orderId,
      kind: "note_added",
      actor: "system",
      message: `Auto-ship: purchase failed — ${err instanceof Error ? err.message : "unknown"}`,
    });
    return false;
  }

  // 5. Persist label info on the order (tolerant of missing columns)
  const payload: Record<string, unknown> = {
    shippo_label_url: tx.label_url ?? null,
    shippo_transaction_id: tx.object_id,
    shippo_rate_id: candidate.object_id,
    shipping_service: candidate.servicelevel?.name ?? null,
    shipping_cost_cents: Math.round(Number(candidate.amount) * 100),
    tracking_number: tx.tracking_number ?? null,
    tracking_carrier: candidate.provider,
    tracking_url: tx.tracking_url_provider ?? null,
    tracking_status: tx.tracking_status ?? "PRE_TRANSIT",
    shipped_at: new Date().toISOString(),
  };

  let res = await service.from("orders").update(payload).eq("id", orderId);
  let attempts = 0;
  while (res.error && /column|does not exist/i.test(res.error.message) && attempts < 10) {
    const m = res.error.message.match(/"([^"]+)"/);
    const col = m?.[1];
    if (!col || !(col in payload)) break;
    delete payload[col];
    res = await service.from("orders").update(payload).eq("id", orderId);
    attempts += 1;
  }

  await logOrderEvent(service, {
    orderId,
    kind: "shipped",
    actor: "system",
    message: `Auto-shipped via ${candidate.provider} ${candidate.servicelevel?.name ?? ""} · ${tx.tracking_number ?? "no tracking yet"}`,
    metadata: {
      label_url: tx.label_url ?? null,
      transaction_id: tx.object_id,
      tracking_number: tx.tracking_number ?? null,
      provider: candidate.provider,
      service: candidate.servicelevel?.name ?? null,
      cost: candidate.amount,
    },
  });

  return true;
}

/**
 * Best-effort parser of the free-text `shipping_address` we collect at
 * checkout. We try to extract street/city/state/zip from common formats:
 *
 *   "123 Main St\nApt 4B\nAtlanta, GA 30324\nUS"
 *   "123 Main St, Atlanta, GA 30324"
 */
function parseShippingAddress(
  raw: string | null,
  fallbackName: string | null,
  phone: string | null,
  email: string | null
): ShippoAddress {
  const empty: ShippoAddress = {
    name: fallbackName ?? "Customer",
    street1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: phone ?? undefined,
    email: email ?? undefined,
  };
  if (!raw) return empty;
  const lines = raw
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return empty;

  // Try to match "City, ST 12345" anywhere in the address
  let cityStateZipIdx = -1;
  let city = "";
  let state = "";
  let zip = "";
  const cszRe = /^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(cszRe);
    if (m) {
      city = m[1].trim();
      state = m[2];
      zip = m[3];
      cityStateZipIdx = i;
      break;
    }
  }

  // If the entire address is on one line, look for ", City, ST 12345" tail
  if (cityStateZipIdx === -1 && lines.length === 1) {
    const m = lines[0].match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    if (m) {
      return {
        ...empty,
        street1: m[1].trim(),
        city: m[2].trim(),
        state: m[3],
        zip: m[4],
      };
    }
    return { ...empty, street1: lines[0] };
  }

  const street1 = lines[0] ?? "";
  const street2 =
    cityStateZipIdx > 1 ? lines.slice(1, cityStateZipIdx).join(", ") : undefined;

  return {
    ...empty,
    street1,
    street2,
    city,
    state,
    zip,
  };
}
