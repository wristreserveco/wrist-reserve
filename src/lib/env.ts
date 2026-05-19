/**
 * Environment helpers — single source of truth for which optional services
 * are configured at runtime. Every gateway is OFF unless the env vars say so,
 * so the build never breaks just because a key is missing.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isCryptoConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY);
}

/**
 * PayPal — re-exported here for convenience and to keep all `is…Configured()`
 * helpers in one place. Implementation lives in `lib/payments/paypal`.
 */
export { isPaypalConfigured } from "@/lib/payments/paypal";
