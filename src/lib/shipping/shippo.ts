/**
 * Lightweight Shippo REST client. We deliberately avoid the official SDK so
 * we can deploy on Edge runtimes if needed and keep the bundle small.
 *
 * Docs: https://docs.goshippo.com/shippoapi/public-api/
 */
import crypto from "node:crypto";
import { getShippoConfig, type ParcelDefaults, type ShipFromAddress } from "./config";

const API_BASE = "https://api.goshippo.com";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ShippoAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ShippoParcel {
  length: string; // Shippo wants strings
  width: string;
  height: string;
  distance_unit: "in" | "cm";
  weight: string;
  mass_unit: "oz" | "lb" | "g" | "kg";
}

export interface ShippoRate {
  object_id: string;
  amount: string; // "12.34" — already in settlement currency
  currency: string;
  provider: string; // "USPS", "UPS", "FedEx"
  servicelevel: { name: string; token: string };
  estimated_days: number | null;
  duration_terms: string | null;
  attributes: string[];
}

export interface ShippoShipment {
  object_id: string;
  rates: ShippoRate[];
  messages: { source?: string; code?: string; text: string }[];
}

export interface ShippoTransaction {
  object_id: string;
  object_state: "VALID" | "INVALID";
  status: "WAITING" | "QUEUED" | "SUCCESS" | "ERROR" | "REFUNDED" | "REFUNDPENDING" | "REFUNDREJECTED";
  rate?: string;
  tracking_number?: string;
  tracking_status?: string;
  tracking_url_provider?: string;
  label_url?: string;
  commercial_invoice_url?: string | null;
  messages: { source?: string; code?: string; text: string }[];
}

export interface ShippoTrackingPayload {
  carrier: string;
  tracking_number: string;
  tracking_status?: { status: string; status_details?: string; status_date?: string };
  tracking_history?: unknown[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function asShippoAddress(a: ShipFromAddress | ShippoAddress): ShippoAddress {
  return {
    name: a.name,
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    email: a.email,
  };
}

function defaultsToParcel(d: ParcelDefaults, qty: number): ShippoParcel {
  // Per-watch weight × qty, padded a couple ounces for box / packing.
  const totalOz = Math.max(2, d.weight * Math.max(1, qty) + 2);
  return {
    length: String(d.length),
    width: String(d.width),
    height: String(d.height),
    distance_unit: "in",
    weight: totalOz.toFixed(2),
    mass_unit: "oz",
  };
}

async function shippoFetch<T>(
  path: string,
  init: RequestInit & { method: "GET" | "POST" }
): Promise<T> {
  const cfg = getShippoConfig();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      Authorization: `ShippoToken ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shippo ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

// ─── Public API ─────────────────────────────────────────────────────────

export async function fetchRates(opts: {
  to: ShippoAddress;
  quantity: number;
  parcelOverride?: Partial<ParcelDefaults>;
}): Promise<{ shipmentId: string; rates: ShippoRate[]; messages: ShippoShipment["messages"] }> {
  const cfg = getShippoConfig();
  const parcelDefaults: ParcelDefaults = { ...cfg.parcel, ...(opts.parcelOverride ?? {}) };
  const parcel = defaultsToParcel(parcelDefaults, opts.quantity);

  const shipment = await shippoFetch<ShippoShipment>("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: asShippoAddress(cfg.from),
      address_to: asShippoAddress(opts.to),
      parcels: [parcel],
      async: false,
    }),
  });

  const rates = (shipment.rates ?? [])
    .slice()
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  return { shipmentId: shipment.object_id, rates, messages: shipment.messages ?? [] };
}

export async function purchaseLabel(opts: {
  rateId: string;
  declaredValueUsd?: number;
  signatureRequired?: boolean;
}): Promise<ShippoTransaction> {
  const cfg = getShippoConfig();
  const wantSig =
    opts.signatureRequired ??
    (cfg.signatureRequiredOverUsd != null &&
      typeof opts.declaredValueUsd === "number" &&
      opts.declaredValueUsd >= cfg.signatureRequiredOverUsd);

  const body: Record<string, unknown> = {
    rate: opts.rateId,
    label_file_type: "PDF_4x6",
    async: false,
  };

  const extra: Record<string, unknown> = {};
  if (wantSig) extra.signature_confirmation = "STANDARD";
  if (
    cfg.insuranceAuto &&
    typeof opts.declaredValueUsd === "number" &&
    opts.declaredValueUsd > 0
  ) {
    extra.insurance_amount = opts.declaredValueUsd.toFixed(2);
    extra.insurance_currency = "USD";
    extra.insurance_content = "Wristwatch";
    extra.insurance_provider = "FEDEX"; // overridden by carrier; safe default
  }
  if (Object.keys(extra).length) body.extra = extra;

  const tx = await shippoFetch<ShippoTransaction>("/transactions/", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (tx.object_state !== "VALID" || tx.status !== "SUCCESS") {
    const msg = tx.messages?.[0]?.text ?? `Status: ${tx.status}`;
    throw new Error(`Shippo refused to issue label: ${msg}`);
  }
  return tx;
}

// ─── Address validation ─────────────────────────────────────────────────
//
// Shippo's address validation hits USPS / international postal databases and
// returns a `validation_results` object indicating whether the address is
// deliverable. We use it as a soft gate at checkout: if Shippo says the
// address is undeliverable, the buyer gets to see the suggested correction
// and decide before paying.
//
// Docs: https://docs.goshippo.com/shippoapi/public-api/#tag/Addresses
// US addresses are FREE to validate; cost ~$0.01 for international.
// ────────────────────────────────────────────────────────────────────────

interface ShippoAddressApiResponse {
  object_id: string;
  is_complete?: boolean;
  validation_results?: {
    is_valid?: boolean;
    messages?: Array<{
      source?: string;
      code?: string;
      type?: string;
      text?: string;
    }>;
  };
  // Shippo returns the cleaned/standardized address back to us in the same
  // top-level fields if it could parse them.
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface AddressValidationResult {
  valid: boolean;
  /** A user-facing summary of what's wrong, when valid=false. */
  message: string | null;
  /** Shippo's cleaned/normalized address. Prefer this over the user input. */
  normalized: ShippoAddress;
  /** Raw shippo response — useful for forensic logs. */
  raw: unknown;
}

export async function validateAddress(
  address: ShippoAddress
): Promise<AddressValidationResult> {
  const body = {
    ...address,
    validate: true,
  };
  const res = await shippoFetch<ShippoAddressApiResponse>("/addresses/", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const vr = res.validation_results;
  const isValid = vr?.is_valid === true;
  const messages = (vr?.messages ?? [])
    .map((m) => m.text)
    .filter((s): s is string => Boolean(s));

  // Build a cleaned-up address using Shippo's standardized fields when
  // present; fall back to the buyer's input so we always have a complete
  // shape to persist downstream.
  const normalized: ShippoAddress = {
    name: res.name ?? address.name,
    company: res.company ?? address.company,
    street1: res.street1 ?? address.street1,
    street2: res.street2 ?? address.street2,
    city: res.city ?? address.city,
    state: res.state ?? address.state,
    zip: res.zip ?? address.zip,
    country: res.country ?? address.country,
    phone: res.phone ?? address.phone,
    email: res.email ?? address.email,
  };

  return {
    valid: isValid,
    message: isValid
      ? null
      : messages[0] ||
        "We couldn't verify this address. Double-check spelling, ZIP, and street number.",
    normalized,
    raw: res,
  };
}

export async function refundLabel(transactionId: string): Promise<void> {
  await shippoFetch("/refunds/", {
    method: "POST",
    body: JSON.stringify({ transaction: transactionId, async: false }),
  });
}

// ─── Webhook signature ──────────────────────────────────────────────────
// Shippo signs webhooks with HMAC-SHA256(secret, raw_body). The signature
// arrives in the `Shippo-Signature` header as a hex string.

export function verifyShippoSignature(rawBody: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  const cfg = getShippoConfig();
  if (!cfg.webhookSecret) return false;
  const expected = crypto
    .createHmac("sha256", cfg.webhookSecret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(headerValue, "hex")
    );
  } catch {
    return false;
  }
}

// Convenient mapping of carrier code → human label
export const CARRIER_LABEL: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl_express: "DHL Express",
  dhl_ecommerce: "DHL eCommerce",
};
