import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/products";
import { PendingOrderTracker } from "@/components/checkout/PendingOrderTracker";
import { makeMemoCode } from "@/lib/payments/manual";

export const dynamic = "force-dynamic";

interface Props {
  params: { orderId: string };
}

export default async function PendingOrderPage({ params }: Props) {
  if (!isSupabaseConfigured()) notFound();

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, product_id, amount, email, customer_name, payment_method, payment_status, payment_ref, created_at"
    )
    .eq("id", params.orderId)
    .single();

  if (!order) notFound();

  const { data: product } = order.product_id
    ? await supabase
        .from("products")
        .select("name")
        .eq("id", order.product_id)
        .single()
    : { data: null };

  const memo = makeMemoCode(order.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-400/90">
        Order · {memo}
      </p>
      <h1 className="mt-3 font-display text-4xl text-white">
        {order.customer_name ? `Thank you, ${order.customer_name}.` : "Thank you."}
      </h1>
      <p className="mt-3 text-sm text-white/55">
        {product?.name ? `${product.name} · ` : ""}
        {formatPrice(Number(order.amount))}
      </p>

      <div className="mt-10">
        <PendingOrderTracker orderId={order.id} />
      </div>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link
          href="/shop"
          className="rounded-sm border border-white/10 px-6 py-3 text-xs uppercase tracking-[0.22em] text-white/60 transition hover:border-white/30 hover:text-white"
        >
          Keep browsing
        </Link>
        <Link
          href="/"
          className="rounded-sm bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200"
        >
          Home
        </Link>
      </div>

      <p className="mt-16 text-center text-[10px] uppercase tracking-[0.25em] text-white/30">
        Questions? Tap the chat icon bottom-right — we reply within minutes.
      </p>
    </div>
  );
}
