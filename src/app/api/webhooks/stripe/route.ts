import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { decrementProductStock } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const body = await request.text();
  const headerStore = await headers();
  const sig = headerStore.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const productId = session.metadata?.product_id;
    const email =
      session.customer_details?.email ||
      session.customer_email ||
      null;
    const amountTotal = session.amount_total != null ? session.amount_total / 100 : 0;

    try {
      const supabase = createServiceClient();
      await supabase.from("orders").insert({
        product_id: productId ?? null,
        email,
        amount: amountTotal,
        payment_method: "stripe",
        payment_status: "paid",
        payment_ref: session.id,
        customer_name: session.customer_details?.name ?? null,
        customer_phone: session.customer_details?.phone ?? null,
      });

      if (productId) {
        await decrementProductStock(supabase, productId);
      }
    } catch {
      return NextResponse.json({ received: true, persisted: false }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
