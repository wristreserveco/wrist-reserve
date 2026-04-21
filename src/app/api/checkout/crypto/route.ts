import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProduct } from "@/lib/products";
import { createCryptoInvoice } from "@/lib/payments/nowpayments";
import { isCryptoConfigured } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isCryptoConfigured()) {
    return NextResponse.json(
      { error: "Crypto payments not configured" },
      { status: 503 }
    );
  }

  let body: {
    productId?: string;
    email?: string;
    name?: string;
    phone?: string;
    payCurrency?: string;
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
  if (product.status !== "available") {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      product_id: product.id,
      email: body.email ?? null,
      amount: product.price,
      payment_method: "crypto",
      payment_status: "pending",
      customer_name: body.name ?? null,
      customer_phone: body.phone ?? null,
    })
    .select("id")
    .single();

  if (orderErr || !orderRow) {
    return NextResponse.json(
      { error: "Failed to create order" },
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
      priceAmount: Number(product.price.toFixed(2)),
      priceCurrency: "usd",
      orderId: orderRow.id,
      orderDescription: product.name,
      ipnCallbackUrl: `${siteUrl}/api/webhooks/nowpayments`,
      successUrl: `${siteUrl}/checkout/pending/${orderRow.id}?paid=1`,
      cancelUrl: `${siteUrl}/products/${product.id}`,
      payCurrency: body.payCurrency,
      customerEmail: body.email,
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
