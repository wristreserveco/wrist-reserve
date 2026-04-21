import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/products";
import { makeMemoCode, MANUAL_METHOD_LABEL, type ManualMethod } from "@/lib/payments/manual";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";
import { OrderTimeline } from "@/components/admin/OrderTimeline";
import { CopyButtonClient } from "@/components/admin/CopyButtonClient";
import type { OrderEventRow } from "@/lib/orders/events";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

const STATUS_CLASS: Record<string, string> = {
  paid: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  pending: "border-gold-400/40 bg-gold-400/10 text-gold-200",
  cancelled: "border-red-400/40 bg-red-400/10 text-red-200",
  expired: "border-red-400/40 bg-red-400/10 text-red-200",
  refunded: "border-white/20 bg-white/5 text-white/60",
};

const METHOD_LABEL: Record<string, string> = {
  crypto: "Crypto",
  manual: "Manual",
  stripe: "Card",
};

export default async function AdminOrderDetailPage({ params }: Props) {
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();

  // Generous select; fall back if new columns missing.
  let { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, email, amount, created_at, payment_method, payment_status, payment_ref, customer_name, customer_phone, notes, shipping_address, proof_url, proof_mime, proof_uploaded_at, verified_at, shipped_at, tracking_number, tracking_carrier, admin_notes"
    )
    .eq("id", params.id)
    .single();

  if (error && /column|does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from("orders")
      .select(
        "id, product_id, email, amount, created_at, payment_method, payment_status, payment_ref, customer_name, customer_phone, notes"
      )
      .eq("id", params.id)
      .single();
    order = fallback.data as typeof order;
    error = fallback.error ?? null;
  }

  if (error || !order) notFound();

  const { data: product } = order.product_id
    ? await supabase
        .from("products")
        .select("id, name, price, media_urls")
        .eq("id", order.product_id)
        .single()
    : { data: null };

  let events: OrderEventRow[] = [];
  try {
    const { data } = await supabase
      .from("order_events")
      .select("*")
      .eq("order_id", params.id)
      .order("created_at", { ascending: true });
    events = (data ?? []) as OrderEventRow[];
  } catch {
    events = [];
  }

  const status = order.payment_status ?? "pending";
  const method = order.payment_method ?? "manual";
  const memo = makeMemoCode(order.id);
  const amount = Number(order.amount);
  const manualRef = (order.payment_ref as ManualMethod | null) ?? null;
  const proofUrl =
    typeof (order as Record<string, unknown>).proof_url === "string"
      ? ((order as Record<string, unknown>).proof_url as string)
      : null;
  const proofMime =
    typeof (order as Record<string, unknown>).proof_mime === "string"
      ? ((order as Record<string, unknown>).proof_mime as string)
      : null;
  const shippingAddress =
    typeof (order as Record<string, unknown>).shipping_address === "string"
      ? ((order as Record<string, unknown>).shipping_address as string)
      : null;
  const trackingNumber =
    typeof (order as Record<string, unknown>).tracking_number === "string"
      ? ((order as Record<string, unknown>).tracking_number as string)
      : null;
  const trackingCarrier =
    typeof (order as Record<string, unknown>).tracking_carrier === "string"
      ? ((order as Record<string, unknown>).tracking_carrier as string)
      : null;
  const adminNotes =
    typeof (order as Record<string, unknown>).admin_notes === "string"
      ? ((order as Record<string, unknown>).admin_notes as string)
      : "";
  const verifiedAt =
    typeof (order as Record<string, unknown>).verified_at === "string"
      ? ((order as Record<string, unknown>).verified_at as string)
      : null;
  const shippedAt =
    typeof (order as Record<string, unknown>).shipped_at === "string"
      ? ((order as Record<string, unknown>).shipped_at as string)
      : null;

  const ageHours = (Date.now() - new Date(order.created_at).getTime()) / 3600000;
  const pendingAging = status === "pending" && ageHours > 24;

  return (
    <div className="space-y-8">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/orders"
            className="text-[10px] uppercase tracking-[0.2em] text-white/45 hover:text-white"
          >
            ← Orders
          </Link>
          <h1 className="mt-3 flex flex-wrap items-center gap-3 font-display text-3xl text-white">
            <span>{product?.name ?? "Order"}</span>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                STATUS_CLASS[status] ?? "border-white/20 text-white/60"
              }`}
            >
              {status}
            </span>
            {pendingAging ? (
              <span className="rounded-full border border-red-400/50 bg-red-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-red-200">
                {ageHours > 72 ? "overdue" : "aging"}
              </span>
            ) : null}
          </h1>
          <p className="mt-2 font-mono text-xs text-white/60">
            {memo} · {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl text-white">
            {formatPrice(amount)}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {METHOD_LABEL[method] ?? method}
            {manualRef ? ` · ${MANUAL_METHOD_LABEL[manualRef] ?? manualRef}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- Customer + payment details ---------- */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-sm border border-white/10 bg-zinc-950/70 p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
              Payment reconciliation
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <Field
                label="Memo to match"
                value={<span className="font-mono text-gold-200">{memo}</span>}
                copyable={memo}
              />
              <Field label="Amount" value={formatPrice(amount)} copyable={String(amount)} />
              <Field
                label="Method"
                value={
                  manualRef
                    ? MANUAL_METHOD_LABEL[manualRef] ?? manualRef
                    : METHOD_LABEL[method] ?? method
                }
              />
              <Field
                label="Proof of payment"
                value={
                  proofUrl ? (
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gold-300 underline decoration-dotted hover:text-gold-200"
                    >
                      View receipt ↗
                    </a>
                  ) : (
                    <span className="text-white/40">Not uploaded</span>
                  )
                }
              />
            </dl>

            {proofUrl && proofMime?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofUrl}
                alt="Payment proof"
                className="mt-5 max-h-[420px] rounded-sm border border-white/10 bg-black object-contain"
              />
            ) : null}
            {proofUrl && proofMime === "application/pdf" ? (
              <a
                href={proofUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-sm border border-white/15 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/80 hover:border-white hover:text-white"
              >
                Open PDF receipt ↗
              </a>
            ) : null}
          </section>

          <section className="rounded-sm border border-white/10 bg-zinc-950/70 p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
              Customer
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Name" value={order.customer_name ?? <Missing />} />
              <Field
                label="Email"
                value={order.email ?? <Missing />}
                copyable={order.email ?? undefined}
              />
              <Field
                label="Phone"
                value={order.customer_phone ?? <Missing />}
                copyable={order.customer_phone ?? undefined}
              />
              <Field
                label="Shipping address"
                value={
                  shippingAddress ? (
                    <span className="whitespace-pre-wrap">{shippingAddress}</span>
                  ) : (
                    <Missing />
                  )
                }
                copyable={shippingAddress ?? undefined}
                span2
              />
              {order.notes ? (
                <Field
                  label="Buyer note"
                  value={<span className="whitespace-pre-wrap text-white/70">{order.notes}</span>}
                  span2
                />
              ) : null}
            </dl>
          </section>

          <AdminOrderActions
            orderId={order.id}
            status={status as string}
            initialNotes={adminNotes}
            trackingNumber={trackingNumber}
            trackingCarrier={trackingCarrier}
            verifiedAt={verifiedAt}
            shippedAt={shippedAt}
          />
        </div>

        {/* ---------- Timeline ---------- */}
        <div>
          <OrderTimeline events={events} />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  copyable,
  span2,
}: {
  label: string;
  value: React.ReactNode;
  copyable?: string;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</dt>
      <dd className="mt-1 flex items-start gap-2 text-white">
        <span className="min-w-0 flex-1">{value}</span>
        {copyable ? <CopyButton value={copyable} /> : null}
      </dd>
    </div>
  );
}

function Missing() {
  return <span className="text-white/40">—</span>;
}

function CopyButton({ value }: { value: string }) {
  return <CopyButtonClient value={value} />;
}
