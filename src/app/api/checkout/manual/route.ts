import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProduct, formatPrice } from "@/lib/products";
import { getManualPaymentConfig, isManualPaymentConfigured } from "@/lib/env";
import {
  makeMemoCode,
  cashAppDeepLink,
  squareLinkWithHints,
  MANUAL_METHOD_LABEL,
  type ManualMethod,
} from "@/lib/payments/manual";
import { notifyTelegram } from "@/lib/notifications/telegram";
import { logOrderEvent } from "@/lib/orders/events";

export const runtime = "nodejs";

interface Body {
  productId?: string;
  method?: ManualMethod;
}

export async function POST(request: Request) {
  if (!isManualPaymentConfigured()) {
    return NextResponse.json(
      { error: "Manual payments not configured" },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const cfg = getManualPaymentConfig();
  const method: ManualMethod =
    body.method && cfg.enabled.includes(body.method)
      ? body.method
      : cfg.enabled[0]!;
  if (!method) {
    return NextResponse.json({ error: "No manual method available" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const { data: row, error: prodErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();
  if (prodErr || !row) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = mapProduct(row as Record<string, unknown>);
  const productSquareUrl =
    typeof (row as Record<string, unknown>).square_url === "string"
      ? ((row as Record<string, unknown>).square_url as string)
      : null;

  // Per-method handle / URL lookup. Square falls back from product → env.
  let handle: string | undefined;
  if (method === "zelle") handle = cfg.zelle;
  else if (method === "cashapp") handle = cfg.cashapp;
  else if (method === "applecash") handle = cfg.applecash;
  else if (method === "wire") handle = cfg.wire;
  else if (method === "square") handle = productSquareUrl || cfg.square;

  if (!handle) {
    return NextResponse.json(
      { error: `${MANUAL_METHOD_LABEL[method]} not configured` },
      { status: 503 }
    );
  }
  if (product.status !== "available" || product.quantity <= 0) {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      product_id: product.id,
      amount: product.price,
      payment_method: "manual",
      payment_status: "pending",
      payment_ref: method,
    })
    .select("id")
    .single();

  if (orderErr || !orderRow) {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  const memo = makeMemoCode(orderRow.id);

  await logOrderEvent(supabase, {
    orderId: orderRow.id,
    kind: "created",
    actor: "buyer",
    message: `${product.name} · ${formatPrice(product.price)} via ${MANUAL_METHOD_LABEL[method]}`,
    metadata: { method, memo, amount: product.price },
  });
  let deepLink: string | null = null;
  if (method === "cashapp") {
    deepLink = cashAppDeepLink(handle, product.price);
  } else if (method === "square") {
    deepLink = squareLinkWithHints(handle, { amount: product.price, memo });
  }

  const qrImageUrl =
    method === "cashapp"
      ? cfg.cashappQrUrl ?? null
      : method === "zelle"
      ? cfg.zelleQrUrl ?? null
      : null;

  void notifyTelegram(
    `<b>⏳ New pending order</b>\n` +
      `${product.name} — ${formatPrice(product.price)}\n` +
      `Method: ${MANUAL_METHOD_LABEL[method]}\n` +
      `Memo: <code>${memo}</code>\n` +
      `Order #${orderRow.id.slice(0, 8)}`
  );

  return NextResponse.json({
    orderId: orderRow.id,
    method,
    methodLabel: MANUAL_METHOD_LABEL[method],
    handle,
    amount: product.price,
    amountDisplay: formatPrice(product.price),
    memo,
    deepLink,
    qrImageUrl,
    productName: product.name,
  });
}
