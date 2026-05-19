import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProduct } from "@/lib/products";
import { createCryptoInvoice } from "@/lib/payments/nowpayments";
import { isCryptoConfigured } from "@/lib/env";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `crypto-checkout:${ip}`,
    limit: 20,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  if (!isCryptoConfigured()) {
    return NextResponse.json(
      { error: "Crypto payments not configured" },
      { status: 503 }
    );
  }

  let body: {
    productId?: string;
    quantity?: number;
    email?: string;
    name?: string;
    phone?: string;
    payCurrency?: string;
    shipping?: {
      name?: string;
      street1?: string;
      street2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const ship = body.shipping;
  const hasFullShipping = Boolean(
    ship?.name?.trim() &&
      ship?.street1?.trim() &&
      ship?.city?.trim() &&
      ship?.state?.trim() &&
      ship?.zip?.trim() &&
      ship?.email?.trim()
  );
  const requestedQty =
    Number.isFinite(body.quantity) && body.quantity! > 0
      ? Math.floor(body.quantity!)
      : 1;

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = mapProduct(row as Record<string, unknown>);
  if (product.hidden) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (product.status !== "available" || product.quantity <= 0) {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }
  const quantity = Math.min(requestedQty, product.quantity);
  if (quantity < 1) {
    return NextResponse.json({ error: "Out of stock" }, { status: 400 });
  }
  const totalAmount = Number((product.price * quantity).toFixed(2));

  let formattedAddress: string;
  let orderEmail: string;
  let customerName: string;
  let customerPhone: string | null;

  if (hasFullShipping) {
    const s = ship!;
    customerName = s.name!.trim().slice(0, 80);
    customerPhone = s.phone?.trim().slice(0, 32) || null;
    orderEmail = s.email!.trim().slice(0, 180);
    formattedAddress = [
      s.name!.trim(),
      s.street1!.trim(),
      s.street2?.trim() || null,
      `${s.city!.trim()}, ${s.state!.trim().toUpperCase()} ${s.zip!.trim()}`,
      s.phone?.trim() || null,
      s.email!.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    customerName = "Pending checkout";
    customerPhone = null;
    orderEmail = `${randomUUID()}@checkout.pending.wristreserve`;
    formattedAddress =
      "Ship-to and email to be confirmed after crypto payment (or add them in NOWPayments checkout if offered).";
  }

  // Insert with quantity + shipping; progressive fallback strips any
  // unknown columns so this still works on partially-migrated installs.
  const basePayload: Record<string, unknown> = {
    product_id: product.id,
    email: orderEmail,
    amount: totalAmount,
    quantity,
    payment_method: "crypto",
    payment_status: "pending",
    customer_name: customerName,
    customer_phone: customerPhone,
    shipping_address: formattedAddress,
  };
  let orderRes = await supabase
    .from("orders")
    .insert(basePayload)
    .select("id")
    .single();
  let cryptoAttempts = 0;
  while (
    orderRes.error &&
    /column|does not exist|schema/i.test(orderRes.error.message) &&
    cryptoAttempts < 8
  ) {
    const match = orderRes.error.message.match(/"([^"]+)"/);
    const col = match?.[1];
    if (!col || !(col in basePayload)) break;
    delete basePayload[col];
    orderRes = await supabase
      .from("orders")
      .insert(basePayload)
      .select("id")
      .single();
    cryptoAttempts += 1;
  }
  const { data: orderRow, error: orderErr } = orderRes;

  if (orderErr || !orderRow) {
    return NextResponse.json(
      {
        error: orderErr?.message
          ? `Failed to create order: ${orderErr.message}`
          : "Failed to create order",
      },
      { status: 500 }
    );
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get("origin") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  try {
    const invoice = await createCryptoInvoice({
      priceAmount: totalAmount,
      priceCurrency: "usd",
      orderId: orderRow.id,
      orderDescription:
        quantity > 1 ? `${product.name} × ${quantity}` : product.name,
      ipnCallbackUrl: `${siteUrl}/api/webhooks/nowpayments`,
      successUrl: `${siteUrl}/checkout/pending/${orderRow.id}?paid=1`,
      cancelUrl: `${siteUrl}/products/${product.id}`,
      payCurrency: body.payCurrency,
      customerEmail: hasFullShipping ? orderEmail : undefined,
    });

    await supabase
      .from("orders")
      .update({ payment_ref: invoice.id })
      .eq("id", orderRow.id);

    return NextResponse.json({
      orderId: orderRow.id,
      invoiceUrl: invoice.invoice_url,
    });
  } catch (e) {
    await supabase
      .from("orders")
      .update({ payment_status: "cancelled" })
      .eq("id", orderRow.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Crypto invoice failed" },
      { status: 500 }
    );
  }
}
