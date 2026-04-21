import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/products";
import { OrderStatusControls } from "@/components/admin/OrderStatusControls";
import { AdminOrdersSearch } from "@/components/admin/AdminOrdersSearch";
import { makeMemoCode } from "@/lib/payments/manual";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  crypto: "Crypto",
  manual: "Manual",
  stripe: "Card",
};

const STATUS_CLASS: Record<string, string> = {
  paid: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  pending: "border-gold-400/40 bg-gold-400/10 text-gold-200",
  cancelled: "border-red-400/40 bg-red-400/10 text-red-200",
  expired: "border-red-400/40 bg-red-400/10 text-red-200",
  refunded: "border-white/20 bg-white/5 text-white/60",
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
];

interface SearchParams {
  q?: string;
  status?: string;
}

function parse(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const resolved = (await Promise.resolve(searchParams)) as SearchParams;
  const q = parse(resolved.q).trim().toLowerCase();
  const statusFilter = parse(resolved.status).trim().toLowerCase();

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-3xl text-white">Orders</h1>
        <p className="mt-4 text-sm text-white/45">Configure Supabase.</p>
      </div>
    );
  }

  const supabase = await createClient();

  // Rich select with fallback for pre-010 installs.
  // eslint-disable-next-line prefer-const
  let { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, email, amount, created_at, payment_method, payment_status, payment_ref, customer_name, customer_phone, proof_url, verified_at, shipped_at, tracking_number"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && /column|does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from("orders")
      .select(
        "id, product_id, email, amount, created_at, payment_method, payment_status, payment_ref, customer_name, customer_phone"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    orders = fallback.data as typeof orders;
  }

  const allOrders = orders ?? [];

  const { data: products } = await supabase.from("products").select("id, name");
  const nameById = Object.fromEntries((products ?? []).map((p) => [p.id, p.name]));

  // Filter + search.
  const filtered = allOrders.filter((o) => {
    const status = (o.payment_status ?? "paid") as string;
    if (statusFilter && status !== statusFilter) return false;
    if (!q) return true;
    const memo = makeMemoCode(o.id).toLowerCase();
    const hay = [
      memo,
      o.email,
      o.customer_name,
      o.customer_phone,
      o.product_id ? nameById[o.product_id] : null,
      (o as Record<string, unknown>).tracking_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const pendingFiltered = filtered.filter((o) => o.payment_status === "pending");
  const outstanding = pendingFiltered.reduce((s, o) => s + Number(o.amount), 0);
  const paidFiltered = filtered.filter((o) => o.payment_status === "paid");
  const paidTotal = paidFiltered.reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Orders</h1>
          <p className="mt-2 text-sm text-white/45">
            Every order in one place. Click any row to open full detail, timeline,
            proof of payment, and admin actions.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Outstanding"
          value={formatPrice(outstanding)}
          sub={`${pendingFiltered.length} pending`}
          tone={outstanding > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Paid (filtered)"
          value={formatPrice(paidTotal)}
          sub={`${paidFiltered.length} orders`}
        />
        <Kpi
          label="Total"
          value={String(filtered.length)}
          sub={`of ${allOrders.length} on record`}
        />
      </div>

      <AdminOrdersSearch q={q} status={statusFilter} tabs={STATUS_TABS} />

      <div className="mt-6 overflow-x-auto rounded-sm border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.15em] text-white/40">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-white/75">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                  {allOrders.length === 0
                    ? "No orders yet."
                    : "No orders match that search."}
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const status = (o.payment_status ?? "paid") as string;
                const method = (o.payment_method ?? "stripe") as string;
                const memo = makeMemoCode(o.id);
                const age = Date.now() - new Date(o.created_at).getTime();
                const ageHours = age / 3600000;
                const pendingAging = status === "pending" && ageHours > 24;
                const proofUrl = (o as Record<string, unknown>).proof_url;
                const shippedAt = (o as Record<string, unknown>).shipped_at;

                return (
                  <tr
                    key={o.id}
                    className="transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="group flex flex-col"
                      >
                        <span className="truncate text-white group-hover:text-gold-200">
                          {o.product_id ? nameById[o.product_id] ?? o.product_id : "—"}
                        </span>
                        <span className="font-mono text-[10px] text-white/45">
                          {memo}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {formatPrice(Number(o.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[160px] flex-col">
                        <span className="text-white">
                          {o.customer_name ?? "—"}
                        </span>
                        <span className="truncate text-xs text-white/45">
                          {o.email ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{METHOD_LABEL[method] ?? method}</span>
                        {method === "manual" && o.payment_ref ? (
                          <span className="text-xs text-white/45">
                            {o.payment_ref}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${
                            STATUS_CLASS[status] ?? "border-white/20 text-white/60"
                          }`}
                        >
                          {status}
                        </span>
                        {proofUrl ? (
                          <span
                            title="Proof uploaded"
                            className="rounded-full border border-emerald-400/30 bg-emerald-400/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200"
                          >
                            📎
                          </span>
                        ) : null}
                        {shippedAt ? (
                          <span
                            title="Shipped"
                            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70"
                          >
                            ✈
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          pendingAging
                            ? ageHours > 72
                              ? "text-red-300"
                              : "text-gold-300"
                            : "text-white/50"
                        }
                      >
                        {formatAge(age)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <OrderStatusControls orderId={o.id} status={status} />
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="rounded-sm border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white hover:text-white"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatAge(ms: number): string {
  const min = ms / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)}m`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h`;
  const day = hr / 24;
  if (day < 30) return `${Math.floor(day)}d`;
  return new Date(Date.now() - ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-sm border bg-zinc-950/70 px-5 py-4 ${
        tone === "warn" ? "border-gold-400/30" : "border-white/10"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-white/45">{sub}</p> : null}
    </div>
  );
}
