import crypto from "node:crypto";

const API_BASE = "https://api.nowpayments.io/v1";

interface CreateInvoiceParams {
  priceAmount: number;
  priceCurrency?: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
  payCurrency?: string;
  customerEmail?: string;
}

export interface NowpaymentsInvoice {
  id: string;
  invoice_url: string;
  token_id?: string;
  order_id?: string;
  order_description?: string;
  price_amount?: string;
  price_currency?: string;
  pay_currency?: string | null;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
  created_at?: string;
  updated_at?: string;
}

export async function createCryptoInvoice(
  params: CreateInvoiceParams
): Promise<NowpaymentsInvoice> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY not configured");
  }

  const payload = {
    price_amount: params.priceAmount,
    price_currency: params.priceCurrency ?? "usd",
    order_id: params.orderId,
    order_description: params.orderDescription,
    ipn_callback_url: params.ipnCallbackUrl,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    pay_currency: params.payCurrency,
    customer_email: params.customerEmail,
    is_fixed_rate: true,
    is_fee_paid_by_user: false,
  };

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments invoice failed (${res.status}): ${text}`);
  }

  return (await res.json()) as NowpaymentsInvoice;
}

/**
 * NOWPayments signs the raw JSON body by sorting keys alphabetically and
 * HMAC-SHA512 with your IPN secret. Compare against x-nowpayments-sig header.
 */
export function verifyIpnSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const sortedJson = JSON.stringify(sortKeysDeep(parsed));
  const computed = crypto
    .createHmac("sha512", secret)
    .update(sortedJson)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        sorted[k] = sortKeysDeep(obj[k]);
      });
    return sorted;
  }
  return value;
}

export type NowpaymentsPaymentStatus =
  | "waiting"
  | "confirming"
  | "confirmed"
  | "sending"
  | "partially_paid"
  | "finished"
  | "failed"
  | "refunded"
  | "expired";

export function mapCryptoStatus(
  status: NowpaymentsPaymentStatus
): "paid" | "pending" | "expired" | "cancelled" | "refunded" {
  switch (status) {
    case "finished":
    case "confirmed":
      return "paid";
    case "failed":
      return "cancelled";
    case "expired":
      return "expired";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}
