import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { formatPrice } from "@/lib/products";
import {
  makeMemoCode,
  MANUAL_METHOD_LABEL,
  type ManualMethod,
} from "@/lib/payments/manual";
import { notifyTelegram } from "@/lib/notifications/telegram";
import { logOrderEvent } from "@/lib/orders/events";

export const runtime = "nodejs";

interface Body {
  orderId?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = body.orderId?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim();
  const address = body.address?.trim();
  if (!orderId || !name || !email || !address) {
    return NextResponse.json(
      { error: "orderId, name, email, and address required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: order, error: getErr } = await supabase
    .from("orders")
    .select("id, product_id, amount, payment_status, payment_method, payment_ref")
    .eq("id", orderId)
    .single();
  if (getErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.payment_method !== "manual") {
    return NextResponse.json({ error: "Not a manual order" }, { status: 400 });
  }

  const notes = [body.notes?.trim(), `Ship to: ${address}`]
    .filter(Boolean)
    .join("\n\n");

  // Try to persist `shipping_address` too — older DBs don't have that column yet.
  let updateRes = await supabase
    .from("orders")
    .update({
      email,
      customer_name: name,
      customer_phone: body.phone?.trim() || null,
      shipping_address: address,
      notes,
    })
    .eq("id", orderId);

  if (updateRes.error && /shipping_address/.test(updateRes.error.message)) {
    updateRes = await supabase
      .from("orders")
      .update({
        email,
        customer_name: name,
        customer_phone: body.phone?.trim() || null,
        notes,
      })
      .eq("id", orderId);
  }

  // Fetch product info for the admin message.
  const { data: product } = order.product_id
    ? await supabase
        .from("products")
        .select("name")
        .eq("id", order.product_id)
        .single()
    : { data: null };

  const method = (order.payment_ref as ManualMethod | null) ?? "cashapp";
  const methodLabel = MANUAL_METHOD_LABEL[method];
  const memo = makeMemoCode(order.id);
  const amount = Number(order.amount);

  const threadMessage = [
    `💳 New order awaiting payment verification`,
    `${product?.name ?? "Order"} — ${formatPrice(amount)}`,
    `Method: ${methodLabel}`,
    `Memo to look for: ${memo}`,
    body.phone ? `Phone: ${body.phone}` : null,
    body.notes ? `Note from buyer: ${body.notes}` : null,
    ``,
    `Ship to:`,
    address,
    ``,
    `Verify payment in your ${methodLabel} app, then mark paid in /admin/orders`,
  ]
    .filter(Boolean)
    .join("\n");

  await supabase.from("messages").insert({
    user_email: email,
    user_name: name,
    sender: "user",
    message: threadMessage,
  });

  await logOrderEvent(supabase, {
    orderId,
    kind: "buyer_details",
    actor: "buyer",
    message: `Shipping to ${address.split("\n")[0]}`,
    metadata: { email, name, phone: body.phone?.trim() ?? null },
  });
  await logOrderEvent(supabase, {
    orderId,
    kind: "buyer_claimed_payment",
    actor: "buyer",
    message: `Buyer says they sent ${formatPrice(amount)} via ${methodLabel} with memo ${memo}`,
    metadata: { amount, method, memo },
  });

  void notifyTelegram(
    `<b>💳 Buyer confirmed send</b>\n` +
      `${name} &lt;${email}&gt;\n` +
      `${product?.name ?? "Order"} — ${formatPrice(amount)}\n` +
      `${methodLabel} · memo <code>${memo}</code>\n` +
      `Check app + mark paid:\n` +
      `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/orders`
  );

  return NextResponse.json({ ok: true });
}
