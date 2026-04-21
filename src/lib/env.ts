export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      process.env.STRIPE_SECRET_KEY.length > 8
  );
}

export function isCryptoConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY);
}

import type { ManualMethod } from "@/lib/payments/manual";

const ALL_MANUAL: ManualMethod[] = [
  "zelle",
  "cashapp",
  "applecash",
  "wire",
  "square",
];

export interface ManualPaymentConfig {
  zelle?: string;
  cashapp?: string;
  applecash?: string;
  wire?: string;
  /** Default Square Checkout URL, used when a product doesn't have its own. */
  square?: string;
  zelleQrUrl?: string;
  cashappQrUrl?: string;
  enabled: ManualMethod[];
}

export function getManualPaymentConfig(): ManualPaymentConfig {
  const raw =
    process.env.NEXT_PUBLIC_MANUAL_PAYMENT_METHODS ?? "zelle,cashapp,wire";
  const enabled = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ManualMethod =>
      ALL_MANUAL.includes(s as ManualMethod)
    );

  // Auto-enable Square if a Square URL is configured, even if the user
  // forgot to list it in NEXT_PUBLIC_MANUAL_PAYMENT_METHODS.
  const squareUrl = process.env.NEXT_PUBLIC_SQUARE_CHECKOUT_URL || undefined;
  if (squareUrl && !enabled.includes("square")) enabled.push("square");

  return {
    zelle: process.env.PAYMENT_ZELLE_HANDLE || undefined,
    cashapp: normalizeCashTag(process.env.PAYMENT_CASHAPP_HANDLE),
    applecash: process.env.PAYMENT_APPLECASH_HANDLE || undefined,
    wire: process.env.PAYMENT_WIRE_INSTRUCTIONS || undefined,
    square: squareUrl,
    zelleQrUrl: process.env.NEXT_PUBLIC_PAYMENT_ZELLE_QR_URL || undefined,
    cashappQrUrl: process.env.NEXT_PUBLIC_PAYMENT_CASHAPP_QR_URL || undefined,
    enabled,
  };
}

export function isManualPaymentConfigured(): boolean {
  const cfg = getManualPaymentConfig();
  return cfg.enabled.length > 0;
}

/**
 * Normalise a Cash App cashtag to always have a leading `$`.
 *
 * Accepts any of: `wristreserveco`, `$wristreserveco`, `'$wristreserveco'`.
 * Returns undefined for empty input. We avoid requiring the `$` in the env
 * file itself because dotenv treats `$NAME` as a variable reference and
 * resolves it to the empty string.
 */
function normalizeCashTag(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return undefined;
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}
