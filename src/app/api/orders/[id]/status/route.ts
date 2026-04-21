import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  cashAppDeepLink,
  makeMemoCode,
  squareLinkWithHints,
  type ManualMethod,
} from "@/lib/payments/manual";
import { getManualPaymentConfig } from "@/lib/env";
import { formatPrice } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  // Try rich select; fall back if proof/tracking columns missing (pre-010).
  let { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, amount, payment_method, payment_status, payment_ref, customer_name, proof_url, proof_mime, shipped_at, tracking_number, tracking_carrier, created_at"
    )
    .eq("id", params.id)
    .single();

  if (error && /proof_|tracking_|shipped_at/.test(error.message)) {
    const fallback = await supabase
      .from("orders")
      .select(
        "id, product_id, amount, payment_method, payment_status, payment_ref, customer_name, created_at"
      )
      .eq("id", params.id)
      .single();
    order = fallback.data as typeof order;
    error = fallback.error ?? null;
  }

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: product } = order.product_id
    ? await supabase
        .from("products")
        .select("name")
        .eq("id", order.product_id)
        .single()
    : { data: null };

  const cfg = getManualPaymentConfig();
  const method = order.payment_method as "crypto" | "manual" | "stripe" | null;
  const ref = order.payment_ref as ManualMethod | null;
  const amount = Number(order.amount);

  let handle: string | null = null;
  let deepLink: string | null = null;
  let qrValue: string | null = null;
  let qrImageUrl: string | null = null;

  if (method === "manual") {
    if (ref === "cashapp" && cfg.cashapp) {
      handle = cfg.cashapp;
      deepLink = cashAppDeepLink(cfg.cashapp, amount);
      qrValue = deepLink;
      qrImageUrl = cfg.cashappQrUrl ?? null;
    } else if (ref === "zelle" && cfg.zelle) {
      handle = cfg.zelle;
      qrImageUrl = cfg.zelleQrUrl ?? null;
    } else if (ref === "applecash" && cfg.applecash) {
      handle = cfg.applecash;
    } else if (ref === "wire" && cfg.wire) {
      handle = cfg.wire;
    } else if (ref === "square") {
      // Prefer the product's square_url override, else the default env URL.
      const productSquareUrl = order.product_id
        ? await (async () => {
            const { data: prod } = await supabase
              .from("products")
              .select("square_url")
              .eq("id", order.product_id)
              .maybeSingle();
            return prod && typeof prod.square_url === "string"
              ? prod.square_url
              : null;
          })().catch(() => null)
        : null;
      const base = productSquareUrl || cfg.square || null;
      if (base) {
        handle = base;
        deepLink = squareLinkWithHints(base, {
          amount,
          memo: makeMemoCode(order.id),
        });
      }
    }
  }

  // Pull the last handful of timeline events (best-effort; silent if table missing).
  let events: Array<{
    id: string;
    kind: string;
    message: string | null;
    actor: string;
    created_at: string;
  }> = [];
  try {
    const { data: evRows } = await supabase
      .from("order_events")
      .select("id, kind, message, actor, created_at")
      .eq("order_id", params.id)
      .order("created_at", { ascending: true })
      .limit(30);
    events = (evRows ?? []) as typeof events;
  } catch {
    events = [];
  }

  return NextResponse.json({
    id: order.id,
    status: order.payment_status,
    method,
    methodRef: ref,
    amount,
    amountDisplay: formatPrice(amount),
    memo: makeMemoCode(order.id),
    productName: product?.name ?? null,
    customerName: order.customer_name,
    handle,
    deepLink,
    qrValue,
    qrImageUrl,
    proofUrl:
      typeof (order as Record<string, unknown>).proof_url === "string"
        ? ((order as Record<string, unknown>).proof_url as string)
        : null,
    proofMime:
      typeof (order as Record<string, unknown>).proof_mime === "string"
        ? ((order as Record<string, unknown>).proof_mime as string)
        : null,
    trackingNumber:
      typeof (order as Record<string, unknown>).tracking_number === "string"
        ? ((order as Record<string, unknown>).tracking_number as string)
        : null,
    trackingCarrier:
      typeof (order as Record<string, unknown>).tracking_carrier === "string"
        ? ((order as Record<string, unknown>).tracking_carrier as string)
        : null,
    shippedAt:
      typeof (order as Record<string, unknown>).shipped_at === "string"
        ? ((order as Record<string, unknown>).shipped_at as string)
        : null,
    events,
  });
}
