/**
 * Shipping configuration loaded from environment variables.
 * Validated lazily so the rest of the app keeps working when Shippo isn't
 * yet configured.
 */

export interface ShipFromAddress {
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

export interface ParcelDefaults {
  length: number; // inches
  width: number; // inches
  height: number; // inches
  weight: number; // ounces (per item, multiplied by quantity at label time)
}

export interface ShippoConfig {
  apiToken: string;
  from: ShipFromAddress;
  parcel: ParcelDefaults;
  insuranceAuto: boolean;
  signatureRequiredOverUsd: number | null;
  webhookSecret: string | null;
}

export function isShippoConfigured(): boolean {
  return Boolean(
    process.env.SHIPPO_API_TOKEN &&
      process.env.SHIPPO_FROM_NAME &&
      process.env.SHIPPO_FROM_STREET1 &&
      process.env.SHIPPO_FROM_CITY &&
      process.env.SHIPPO_FROM_STATE &&
      process.env.SHIPPO_FROM_ZIP
  );
}

export function getShippoConfig(): ShippoConfig {
  if (!isShippoConfigured()) {
    throw new Error(
      "Shippo is not configured. Missing one of: SHIPPO_API_TOKEN, SHIPPO_FROM_NAME, SHIPPO_FROM_STREET1, SHIPPO_FROM_CITY, SHIPPO_FROM_STATE, SHIPPO_FROM_ZIP."
    );
  }
  return {
    apiToken: process.env.SHIPPO_API_TOKEN!,
    from: {
      name: process.env.SHIPPO_FROM_NAME!,
      company: process.env.SHIPPO_FROM_COMPANY || undefined,
      street1: process.env.SHIPPO_FROM_STREET1!,
      street2: process.env.SHIPPO_FROM_STREET2 || undefined,
      city: process.env.SHIPPO_FROM_CITY!,
      state: process.env.SHIPPO_FROM_STATE!,
      zip: process.env.SHIPPO_FROM_ZIP!,
      country: process.env.SHIPPO_FROM_COUNTRY || "US",
      phone: process.env.SHIPPO_FROM_PHONE || undefined,
      email: process.env.SHIPPO_FROM_EMAIL || undefined,
    },
    parcel: {
      length: numEnv("SHIPPO_DEFAULT_PARCEL_LENGTH_IN", 8),
      width: numEnv("SHIPPO_DEFAULT_PARCEL_WIDTH_IN", 6),
      height: numEnv("SHIPPO_DEFAULT_PARCEL_HEIGHT_IN", 4),
      weight: numEnv("SHIPPO_DEFAULT_PARCEL_WEIGHT_OZ", 16),
    },
    insuranceAuto:
      (process.env.SHIPPO_INSURANCE_AUTO ?? "false").toLowerCase() === "true",
    signatureRequiredOverUsd: process.env.SHIPPO_SIGNATURE_REQUIRED_OVER_USD
      ? Number(process.env.SHIPPO_SIGNATURE_REQUIRED_OVER_USD)
      : null,
    webhookSecret: process.env.SHIPPO_WEBHOOK_SECRET || null,
  };
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
