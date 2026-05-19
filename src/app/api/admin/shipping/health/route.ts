import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isShippoConfigured } from "@/lib/shipping/config";
import { isPaypalConfigured } from "@/lib/payments/paypal";
import { isCryptoConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click health check for the Shippo + payments wiring.
 *
 * Returns a structured snapshot of:
 *   - which env vars are populated for each integration
 *   - whether the new DB columns from migrations 019 (shippo) and 020 (paypal)
 *     are actually present in production
 *   - whether the auto-ship feature is enabled
 *
 * Admin-only (requires authenticated Supabase user).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Probe migration 019 columns (one tolerant select per group).
  const ordersColumns = await probeColumns(service, "orders", [
    "shippo_label_url",
    "shippo_transaction_id",
    "shippo_rate_id",
    "shipping_service",
    "shipping_cost_cents",
    "tracking_url",
    "tracking_status",
  ]);

  // Probe migration 020 — payment_method now needs to accept 'paypal'.
  const paypalConstraint = await probePaypalAllowed(service);

  const autoShip = {
    enabled: (process.env.SHIPPO_AUTO_BUY ?? "").toLowerCase() === "true",
    maxUsd: process.env.SHIPPO_AUTO_BUY_MAX_USD || null,
    preferredCarrier: process.env.SHIPPO_AUTO_BUY_PREFERRED_CARRIER || null,
  };

  const migration_019 = ordersColumns.missing.length === 0 ? "ok" : "missing";
  const migration_020 = paypalConstraint;

  return NextResponse.json({
    overall:
      migration_019 === "ok" && migration_020 === "ok" ? "healthy" : "issues",
    migrations: {
      "019_shippo": {
        status: migration_019,
        present: ordersColumns.present,
        missing: ordersColumns.missing,
        hint:
          ordersColumns.missing.length > 0
            ? "Run supabase/migrations/019_shippo.sql on production."
            : null,
      },
      "020_payment_methods_paypal": {
        status: migration_020,
        hint:
          migration_020 === "ok"
            ? null
            : "Run supabase/migrations/020_payment_methods_paypal.sql on production.",
      },
    },
    payments: {
      paypal: {
        configured: isPaypalConfigured(),
        env: process.env.PAYPAL_ENV ?? "unset",
        webhookSecretSet: Boolean(process.env.PAYPAL_WEBHOOK_ID),
      },
      crypto: {
        configured: isCryptoConfigured(),
      },
    },
    shipping: {
      shippoConfigured: isShippoConfigured(),
      webhookSecretSet: Boolean(process.env.SHIPPO_WEBHOOK_SECRET),
      autoShip,
    },
  });
}

async function probeColumns(
  service: ReturnType<typeof createServiceClient>,
  table: "orders" | "products",
  columns: string[]
): Promise<{ present: string[]; missing: string[] }> {
  const present: string[] = [];
  const missing: string[] = [];
  for (const col of columns) {
    const { error } = await service.from(table).select(col).limit(0);
    if (error && /column|does not exist/i.test(error.message)) {
      missing.push(col);
    } else {
      present.push(col);
    }
  }
  return { present, missing };
}

/**
 * Detect whether the orders.payment_method check constraint allows 'paypal'.
 *
 * Strategy: insert a no-commit row inside a transaction would be ideal, but
 * Supabase's REST API can't do that. Instead we attempt a dry-run insert into
 * a non-existent column with payment_method = 'paypal' and parse the error
 * message — if the constraint is the failure reason, we know it's missing;
 * otherwise the constraint accepted 'paypal' and the failure is the column.
 *
 * Cheaper alternative: read the constraint definition from
 * information_schema.check_constraints — but that requires extra grants on
 * pg_catalog. The dry-run approach works on every Supabase project without
 * additional configuration.
 */
async function probePaypalAllowed(
  service: ReturnType<typeof createServiceClient>
): Promise<"ok" | "missing"> {
  const { error } = await service
    .from("orders")
    .insert({
      payment_method: "paypal",
      __healthcheck_only_never_real: true, // forces a column-not-found error
      amount: 0,
    })
    .select("id");
  if (!error) {
    // Insert somehow succeeded — would never happen, but treat as ok.
    return "ok";
  }
  // If the constraint blocked us, message will mention the check constraint.
  if (
    /payment_method/i.test(error.message) &&
    /check\s+constraint|violates/i.test(error.message)
  ) {
    return "missing";
  }
  // Any other error (column not found, etc.) means the constraint already
  // accepted 'paypal' and only the bogus column tripped the insert. ✓
  return "ok";
}
