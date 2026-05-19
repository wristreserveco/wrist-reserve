import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isShippoConfigured } from "@/lib/shipping/config";
import { formatPrice } from "@/lib/products";
import { makeMemoCode } from "@/lib/orders/memo";

export const dynamic = "force-dynamic";

/**
 * Shipping queue — single screen showing every order grouped by shipping
 * state, so the admin can see at a glance what needs labels, what's in
 * transit, and what's been delivered.
 */

interface OrderRow {
  id: string;
  product_id: string | null;
  amount: number;
  customer_name: string | null;
  shipping_address: string | null;
  payment_status: string | null;
  shipped_at: string | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  tracking_status: string | null;
  shippo_label_url: string | null;
  shipping_service: string | null;
  created_at: string;
}

export default async function AdminShippingPage() {
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();

  // Generous select with a fallback for installs that haven't run migration
  // 019 yet (so the page never crashes during a partial rollout).
  // eslint-disable-next-line prefer-const
  let { data: rows, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, amount, customer_name, shipping_address, payment_status, shipped_at, tracking_number, tracking_carrier, tracking_url, tracking_status, shippo_label_url, shipping_service, created_at"
    )
    .in("payment_status", ["paid", "refunded"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error && /column|does not exist/i.test(error.message)) {
    const fb = await supabase
      .from("orders")
      .select(
        "id, product_id, amount, customer_name, shipping_address, payment_status, shipped_at, tracking_number, tracking_carrier, created_at"
      )
      .in("payment_status", ["paid", "refunded"])
      .order("created_at", { ascending: false })
      .limit(200);
    rows = fb.data as typeof rows;
  }

  const orders = (rows ?? []) as OrderRow[];

  // Pull product names in one query.
  const productIds = Array.from(
    new Set(orders.map((o) => o.product_id).filter(Boolean) as string[])
  );
  const productMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: prodRows } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);
    for (const p of prodRows ?? []) {
      productMap.set((p as { id: string }).id, (p as { name: string }).name);
    }
  }

  // Bucket orders by shipping state.
  const buckets = {
    awaitingLabel: [] as OrderRow[],
    inTransit: [] as OrderRow[],
    delivered: [] as OrderRow[],
  };
  for (const o of orders) {
    const status = (o.tracking_status ?? "").toUpperCase();
    if (!o.shipped_at && !o.tracking_number) {
      buckets.awaitingLabel.push(o);
    } else if (status === "DELIVERED") {
      buckets.delivered.push(o);
    } else {
      buckets.inTransit.push(o);
    }
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Shipping</h1>
          <p className="mt-1 text-sm text-white/55">
            Every paid order in one place. Buy labels, track shipments, monitor delivery.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em]">
          <span
            className={`rounded-full border px-3 py-1.5 ${
              isShippoConfigured()
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/40 bg-red-400/10 text-red-200"
            }`}
          >
            Shippo {isShippoConfigured() ? "connected" : "not configured"}
          </span>
        </div>
      </header>

      {!isShippoConfigured() ? (
        <div className="rounded-sm border border-red-400/30 bg-red-400/[0.04] p-4 text-sm text-red-100/90">
          Shippo isn&rsquo;t configured. Set <code>SHIPPO_API_TOKEN</code> and the{" "}
          <code>SHIPPO_FROM_*</code> env vars in Vercel and redeploy.
        </div>
      ) : null}

      <Bucket
        title="Awaiting label"
        subtitle="Paid orders that need a shipping label bought."
        accent="gold"
        orders={buckets.awaitingLabel}
        productMap={productMap}
        emptyMsg="Nothing waiting on a label. Beautiful."
      />

      <Bucket
        title="In transit"
        subtitle="Labels purchased — carrier has the package or it's on the truck."
        accent="blue"
        orders={buckets.inTransit}
        productMap={productMap}
        emptyMsg="No active shipments."
      />

      <Bucket
        title="Delivered"
        subtitle="Carrier confirmed delivery."
        accent="emerald"
        orders={buckets.delivered}
        productMap={productMap}
        emptyMsg="No deliveries logged yet."
      />
    </div>
  );
}

function Bucket({
  title,
  subtitle,
  accent,
  orders,
  productMap,
  emptyMsg,
}: {
  title: string;
  subtitle: string;
  accent: "gold" | "blue" | "emerald";
  orders: OrderRow[];
  productMap: Map<string, string>;
  emptyMsg: string;
}) {
  const accentClass = {
    gold: "border-gold-400/40 text-gold-200",
    blue: "border-sky-400/40 text-sky-200",
    emerald: "border-emerald-400/40 text-emerald-200",
  }[accent];

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-xl text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${accentClass}`}
        >
          {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-sm border border-dashed border-white/10 bg-zinc-950/40 p-5 text-xs text-white/40">
          {emptyMsg}
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-sm border border-white/10 bg-zinc-950/60">
          {orders.map((o) => (
            <OrderRowDisplay key={o.id} order={o} productName={productMap.get(o.product_id ?? "")} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderRowDisplay({
  order,
  productName,
}: {
  order: OrderRow;
  productName: string | undefined;
}) {
  const memo = makeMemoCode(order.id);
  const recipient = (order.shipping_address ?? "").split(/\n|;/)[0]?.trim() || order.customer_name || "—";
  const carrier = order.tracking_carrier ? `${order.tracking_carrier}` : null;
  const service = order.shipping_service;

  return (
    <li className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm transition hover:bg-white/[0.025]">
      <div className="col-span-12 sm:col-span-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-mono text-xs text-gold-200 hover:underline"
        >
          {memo}
        </Link>
        <p className="mt-0.5 truncate text-white">{productName ?? "—"}</p>
      </div>
      <div className="col-span-6 sm:col-span-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          Recipient
        </p>
        <p className="mt-0.5 truncate text-white/85">{recipient}</p>
      </div>
      <div className="col-span-6 sm:col-span-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          Carrier
        </p>
        <p className="mt-0.5 text-white/85">
          {carrier ?? service ?? <span className="text-white/40">—</span>}
        </p>
        {order.tracking_number ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-white/55">
            {order.tracking_number}
          </p>
        ) : null}
      </div>
      <div className="col-span-12 flex items-center justify-end gap-3 sm:col-span-3">
        {order.tracking_status ? (
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/65">
            {order.tracking_status.toLowerCase().replace(/_/g, " ")}
          </span>
        ) : null}
        <span className="font-mono text-xs text-white/55">
          {formatPrice(Number(order.amount))}
        </span>
        {order.shippo_label_url ? (
          <a
            href={order.shippo_label_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/75 hover:border-white hover:text-white"
          >
            Label PDF
          </a>
        ) : (
          <Link
            href={`/admin/orders/${order.id}`}
            className="rounded-sm bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-black hover:bg-gold-200"
          >
            Open
          </Link>
        )}
      </div>
    </li>
  );
}
