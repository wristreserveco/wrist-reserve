/**
 * Lightweight PayPal Orders v2 REST client.
 *
 * We avoid the official SDK so we can stay on the Next.js Edge/Node runtime
 * without dragging in a heavy dependency. All calls use Bearer-token auth
 * obtained via OAuth2 Client Credentials, cached in-memory between requests.
 *
 * Docs:
 *   - Auth:   https://developer.paypal.com/api/rest/authentication/
 *   - Orders: https://developer.paypal.com/docs/api/orders/v2/
 *   - Webhooks: https://developer.paypal.com/api/rest/webhooks/event-names/
 */

import { Buffer } from "node:buffer";

// ─── Configuration ───────────────────────────────────────────────────────

export type PaypalEnv = "sandbox" | "live";

export interface PaypalConfig {
  clientId: string;
  clientSecret: string;
  env: PaypalEnv;
  webhookId: string | null;
}

export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function getPaypalConfig(): PaypalConfig {
  if (!isPaypalConfigured()) {
    throw new Error(
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
    );
  }
  const env = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  return {
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    env: env === "live" ? "live" : "sandbox",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || null,
  };
}

function apiBase(env: PaypalEnv): string {
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

// ─── Token cache ─────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const cfg = getPaypalConfig();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    "base64"
  );
  const res = await fetch(`${apiBase(cfg.env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token request failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

async function paypalFetch<T>(
  path: string,
  init: RequestInit & { method: "GET" | "POST" | "PATCH" }
): Promise<T> {
  const cfg = getPaypalConfig();
  const token = await getAccessToken();
  const res = await fetch(`${apiBase(cfg.env)}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      `PayPal ${path} failed (${res.status}): ${text || "no body"}`
    );
  }
  return json as T;
}

// ─── Order types ─────────────────────────────────────────────────────────

export interface PaypalOrder {
  id: string;
  status:
    | "CREATED"
    | "SAVED"
    | "APPROVED"
    | "VOIDED"
    | "COMPLETED"
    | "PAYER_ACTION_REQUIRED";
  links: { href: string; rel: string; method: string }[];
  purchase_units?: Array<{
    custom_id?: string;
    shipping?: {
      name?: { full_name?: string };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_1?: string; // state
        admin_area_2?: string; // city
        postal_code?: string;
        country_code?: string;
      };
    };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { value: string; currency_code: string };
      }>;
    };
  }>;
  payer?: {
    email_address?: string;
    phone?: { phone_number?: { national_number?: string } };
    name?: { given_name?: string; surname?: string };
    payer_id?: string;
  };
}

/**
 * Extract the shipping address PayPal collected from the buyer + the
 * buyer's email/phone/name as known to PayPal. Returns null if PayPal
 * didn't surface a usable shipping block (e.g. digital goods, edge cases).
 */
export interface PaypalBuyerInfo {
  name: string;
  email: string;
  phone: string | null;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export function buyerInfoOf(order: PaypalOrder): PaypalBuyerInfo | null {
  const unit = order.purchase_units?.[0];
  const ship = unit?.shipping;
  const addr = ship?.address;
  const street1 = addr?.address_line_1?.trim() || "";
  const city = addr?.admin_area_2?.trim() || "";
  const state = addr?.admin_area_1?.trim() || "";
  const zip = addr?.postal_code?.trim() || "";
  // PayPal always sends address_line_1 + city when shipping is collected.
  // If anything's missing it's not enough to ship — return null.
  if (!street1 || !city || !state || !zip) return null;
  const fullName =
    ship?.name?.full_name?.trim() ||
    [order.payer?.name?.given_name, order.payer?.name?.surname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "";
  const email = order.payer?.email_address?.trim() || "";
  const phoneRaw = order.payer?.phone?.phone_number?.national_number?.trim();
  return {
    name: fullName,
    email,
    phone: phoneRaw ? phoneRaw : null,
    street1,
    street2: addr?.address_line_2?.trim() || null,
    city,
    state: state.toUpperCase(),
    zip,
    country: (addr?.country_code || "US").toUpperCase(),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────

interface CreateOrderArgs {
  /** Our internal order id, round-tripped via custom_id. */
  orderId: string;
  amountUsd: number;
  /**
   * Optional purchase-unit description sent to PayPal (line-item text).
   * Omit or leave empty to avoid extra wording on PayPal’s review screens.
   */
  description?: string;
  returnUrl: string;
  cancelUrl: string;
  /** Soft-cap brand label on PayPal page (max 127 chars). */
  brandName?: string;
  /** Pre-collected, USPS-verified shipping address. When present we pass it
   *  to PayPal as SET_PROVIDED_ADDRESS so the buyer sees the same address
   *  they typed on our checkout form. */
  shipping?: {
    name: string;
    street1: string;
    street2?: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string | null;
    email?: string | null;
  };
}

export async function createPaypalOrder(args: CreateOrderArgs): Promise<PaypalOrder> {
  const purchaseUnit: Record<string, unknown> = {
    custom_id: args.orderId,
    amount: {
      currency_code: "USD",
      value: args.amountUsd.toFixed(2),
    },
  };
  const desc = args.description?.trim();
  if (desc) {
    purchaseUnit.description = desc.slice(0, 127);
  }

  // If we already have a verified address from our own checkout flow, hand
  // it to PayPal so the buyer doesn't get re-prompted and so PayPal's
  // dispute/IPN records carry the shipping destination.
  if (args.shipping) {
    purchaseUnit.shipping = {
      name: { full_name: args.shipping.name.slice(0, 300) },
      address: {
        address_line_1: args.shipping.street1.slice(0, 300),
        address_line_2: (args.shipping.street2 ?? "").slice(0, 300) || undefined,
        admin_area_2: args.shipping.city.slice(0, 120),
        admin_area_1: args.shipping.state.slice(0, 300),
        postal_code: args.shipping.zip.slice(0, 60),
        country_code: (args.shipping.country || "US").slice(0, 2).toUpperCase(),
      },
    };
  }

  const body = {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
    application_context: {
      brand_name: (args.brandName ?? "Wrist Reserve").slice(0, 127),
      // Three shipping-collection modes, chosen by what the caller has:
      //   1. SET_PROVIDED_ADDRESS — we already verified an address ourselves
      //      (e.g. crypto buyers go through our form first); PayPal honors it.
      //   2. GET_FROM_FILE       — we haven't collected an address. PayPal
      //      pre-fills from the buyer's PayPal-saved address and lets them
      //      change/confirm it in the popup. This is the cheapest UX for
      //      conversion because the buyer doesn't fill any form on our site.
      //   3. NO_SHIPPING         — explicitly not used here; we always need
      //      an address to ship a physical watch.
      shipping_preference: args.shipping
        ? "SET_PROVIDED_ADDRESS"
        : "GET_FROM_FILE",
      user_action: "PAY_NOW",
      return_url: args.returnUrl,
      cancel_url: args.cancelUrl,
      landing_page: "LOGIN",
    },
  };
  return paypalFetch<PaypalOrder>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPaypalOrder(paypalOrderId: string): Promise<PaypalOrder> {
  return paypalFetch<PaypalOrder>(`/v2/checkout/orders/${paypalOrderId}`, {
    method: "GET",
  });
}

export async function capturePaypalOrder(paypalOrderId: string): Promise<PaypalOrder> {
  return paypalFetch<PaypalOrder>(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    body: "{}",
  });
}

/** Normalize PayPal status strings (some payloads vary in casing). */
export function paypalStatusNorm(s: string | undefined): string {
  return String(s ?? "").toUpperCase();
}

/**
 * Some GET responses include a capture self link before nested `captures[]`
 * is populated in the JSON we see.
 */
export function captureIdFromPaypalLinks(order: PaypalOrder): string | null {
  for (const l of order.links ?? []) {
    const href = l.href ?? "";
    const m = href.match(/\/v2\/payments\/captures\/([0-9A-Z]+)/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function collectCapturesDeepUnderPurchaseUnits(order: PaypalOrder): Array<{
  id: string;
  status: string;
  amount: number;
  currency: string;
}> {
  const out: Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
  }> = [];

  function walk(node: unknown, depth: number) {
    if (depth > 14 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const caps = rec.captures;
    if (Array.isArray(caps)) {
      for (const raw of caps) {
        if (!raw || typeof raw !== "object") continue;
        const c = raw as Record<string, unknown>;
        const id = typeof c.id === "string" ? c.id.trim() : "";
        if (!id) continue;
        const amt = c.amount as { value?: string; currency_code?: string } | undefined;
        if (amt && typeof amt.value === "string") {
          out.push({
            id,
            status: String(c.status ?? ""),
            amount: Number(amt.value),
            currency: String(amt.currency_code ?? "USD"),
          });
        }
      }
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  }

  for (const unit of order.purchase_units ?? []) {
    walk(unit, 0);
  }
  return out;
}

/**
 * If PayPal reports the checkout order as COMPLETED but we still cannot read
 * a capture row, synthesize a bookkeeping row so we never strand a charged
 * buyer on "not completed". Prefer a real capture id from `links` when present.
 */
export function reconcileCaptureWhenOrderCompleted(
  order: PaypalOrder,
  paypalCheckoutOrderId: string,
  fallbackAmountUsd: number
): {
  id: string;
  status: string;
  amount: number;
  currency: string;
} | null {
  if (paypalStatusNorm(order.status) !== "COMPLETED") return null;

  const partial = firstCaptureOf(order);
  if (partial && paypalStatusNorm(partial.status) === "COMPLETED") return partial;

  const linkId = captureIdFromPaypalLinks(order);
  if (linkId) {
    return {
      id: linkId,
      status: "COMPLETED",
      amount:
        partial && Number.isFinite(partial.amount) && partial.amount > 0
          ? partial.amount
          : fallbackAmountUsd,
      currency: partial?.currency ?? "USD",
    };
  }

  const pu = order.purchase_units?.[0] as
    | { amount?: { value?: string; currency_code?: string } }
    | undefined;
  const fromUnit = pu?.amount?.value ? Number(pu.amount.value) : NaN;
  const currency = pu?.amount?.currency_code ?? "USD";
  const amount =
    Number.isFinite(fromUnit) && fromUnit > 0 ? fromUnit : fallbackAmountUsd;

  return {
    id: `reconcile-${paypalCheckoutOrderId}`,
    status: "COMPLETED",
    amount,
    currency,
  };
}

/** DB `payment_ref`: keep checkout order id when we only have a synthetic capture key. */
export function paymentRefAfterPaypalCapture(
  paypalCheckoutOrderId: string,
  captureId: string
): string {
  return captureId.startsWith("reconcile-") ? paypalCheckoutOrderId : captureId;
}

export type PaypalCaptureResolveResult =
  | {
      ok: true;
      paypalOrder: PaypalOrder;
      capture: { id: string; status: string; amount: number; currency: string };
    }
  | { ok: false; error: string };

/**
 * After the buyer approves in the Smart Buttons / hosted flow, reconcile
 * capture state: POST /capture, fall back to GET, then accept COMPLETED
 * orders even when nested `captures[]` is missing from the JSON.
 */
export async function resolvePaypalCaptureAfterApproval(
  paypalCheckoutOrderId: string,
  fallbackAmountUsd: number
): Promise<PaypalCaptureResolveResult> {
  try {
    let result: PaypalOrder;
    try {
      result = await capturePaypalOrder(paypalCheckoutOrderId);
    } catch {
      result = await getPaypalOrder(paypalCheckoutOrderId);
    }

    let paypalOrder = result;
    let capture = firstCaptureOf(paypalOrder);
    if (!capture || paypalStatusNorm(capture.status) !== "COMPLETED") {
      const refreshed = await getPaypalOrder(paypalCheckoutOrderId);
      paypalOrder = refreshed;
      capture = firstCaptureOf(refreshed);
      if (!capture || paypalStatusNorm(capture.status) !== "COMPLETED") {
        if (paypalStatusNorm(refreshed.status) === "COMPLETED") {
          const rec = reconcileCaptureWhenOrderCompleted(
            refreshed,
            paypalCheckoutOrderId,
            fallbackAmountUsd
          );
          if (rec) {
            return { ok: true, paypalOrder: refreshed, capture: rec };
          }
        }
      }
    }

    if (capture && paypalStatusNorm(capture.status) === "COMPLETED") {
      return { ok: true, paypalOrder, capture };
    }

    const peek = await getPaypalOrder(paypalCheckoutOrderId).catch(() => null);
    if (peek && paypalStatusNorm(peek.status) === "COMPLETED") {
      const rec = reconcileCaptureWhenOrderCompleted(
        peek,
        paypalCheckoutOrderId,
        fallbackAmountUsd
      );
      if (rec) {
        return { ok: true, paypalOrder: peek, capture: rec };
      }
    }

    return {
      ok: false,
      error: peek
        ? `Could not confirm capture. PayPal order status: ${peek.status}.`
        : "Could not confirm capture with PayPal.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PayPal request failed";
    return { ok: false, error: msg };
  }
}

/**
 * Pull a capture from a PayPal order response. Prefer `COMPLETED`; otherwise
 * return the first capture so callers can decide. Scans **all** purchase_units
 * — the SDK capture POST sometimes omits nested captures while a follow-up
 * GET on the same id returns the full `payments.captures` list.
 */
export function firstCaptureOf(order: PaypalOrder): {
  id: string;
  status: string;
  amount: number;
  currency: string;
} | null {
  const flat: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  }[] = [];
  for (const unit of order.purchase_units ?? []) {
    for (const cap of unit.payments?.captures ?? []) {
      if (!cap?.id) continue;
      flat.push({
        id: cap.id,
        status: cap.status,
        amount: Number(cap.amount?.value ?? 0),
        currency: cap.amount?.currency_code ?? "USD",
      });
    }
  }
  for (const c of collectCapturesDeepUnderPurchaseUnits(order)) {
    if (!flat.some((x) => x.id === c.id)) flat.push(c);
  }
  return (
    flat.find((c) => paypalStatusNorm(c.status) === "COMPLETED") ?? flat[0] ?? null
  );
}

/** Pull the approve link from a freshly-created order. */
export function approveLinkOf(order: PaypalOrder): string | null {
  const link = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
  return link?.href ?? null;
}

// ─── Webhooks ────────────────────────────────────────────────────────────

/**
 * Verify a PayPal webhook signature using the official verification endpoint.
 * This is the recommended approach — the alternative (manual cert + CRC32
 * verification) is more fragile across environments.
 */
export async function verifyPaypalWebhook(args: {
  headers: Headers;
  rawBody: string;
}): Promise<boolean> {
  const cfg = getPaypalConfig();
  if (!cfg.webhookId) return false;
  const transmissionId = args.headers.get("paypal-transmission-id");
  const transmissionTime = args.headers.get("paypal-transmission-time");
  const certUrl = args.headers.get("paypal-cert-url");
  const authAlgo = args.headers.get("paypal-auth-algo");
  const transmissionSig = args.headers.get("paypal-transmission-sig");
  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.rawBody);
  } catch {
    return false;
  }
  try {
    const result = await paypalFetch<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: cfg.webhookId,
          webhook_event: parsed,
        }),
      }
    );
    return result.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

export interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource_type: string;
  summary: string;
  resource: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: { value: string; currency_code: string };
    supplementary_data?: {
      related_ids?: { order_id?: string };
    };
    payer?: { email_address?: string };
  };
  create_time: string;
}
