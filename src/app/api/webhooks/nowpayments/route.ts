import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  mapCryptoStatus,
  verifyIpnSignature,
  type NowpaymentsPaymentStatus,
} from "@/lib/payments/nowpayments";
import { createServiceClient } from "@/lib/supabase/service";
import { decrementProductStock } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const h = await headers();
  const sig = h.get("x-nowpayments-sig") ?? "";

  if (!verifyIpnSignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    payment_status?: NowpaymentsPaymentStatus;
    order_id?: string;
    payment_id?: number | string;
    price_amount?: number | string;
    pay_address?: string;
    pay_currency?: string;
    outcome_amount?: number | string;
    outcome_currency?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.order_id || !payload.payment_status) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const mapped = mapCryptoStatus(payload.payment_status);
  const supabase = createServiceClient();

  const notes = `crypto:${payload.pay_currency ?? "?"} ${payload.outcome_amount ?? ""} ${
    payload.outcome_currency ?? ""
  } · txid ${payload.payment_id ?? ""}`.trim();

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      payment_status: mapped,
      notes,
    })
    .eq("id", payload.order_id);

  if (updateErr) {
    return NextResponse.json({ received: true, persisted: false }, { status: 500 });
  }

  if (mapped === "paid") {
    const { data: order } = await supabase
      .from("orders")
      .select("product_id")
      .eq("id", payload.order_id)
      .single();
    if (order?.product_id) {
      await decrementProductStock(supabase, order.product_id);
    }
  }

  return NextResponse.json({ received: true });
}
