import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/products";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: string;
  product_id: string | null;
  email: string | null;
  amount: number | string;
  payment_method: string | null;
  payment_status: string | null;
  customer_name: string | null;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  price: number | string;
  status: string;
  media_urls: string[] | null;
}

interface MessageRow {
  id: string;
  user_email: string;
  user_name: string | null;
  message: string;
  sender: string;
  read_at: string | null;
  created_at: string;
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function formatRelative(iso: string): string {
  const when = new Date(iso).getTime();
  const diff = Date.now() - when;
  const min = diff / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h ago`;
  const day = hr / 24;
  if (day < 7) return `${Math.floor(day)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function AdminDashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-3xl text-white">Dashboard</h1>
        <p className="mt-4 text-sm text-white/45">
          Configure Supabase environment variables.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const startToday = startOfDay(now).toISOString();
  const startWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: orders },
    { data: products },
    { data: messages },
    { count: unreadCount },
    { count: pendingCount },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("products")
      .select("id, name, price, status, media_urls, featured, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, user_email, user_name, message, sender, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender", "user")
      .is("read_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "pending"),
  ]);

  const orderRows = (orders ?? []) as OrderRow[];
  const productRows = (products ?? []) as ProductRow[];
  const messageRows = (messages ?? []) as MessageRow[];

  const paid = orderRows.filter((o) => o.payment_status === "paid");
  const revenueToday = paid
    .filter((o) => new Date(o.created_at) >= new Date(startToday))
    .reduce((s, o) => s + Number(o.amount), 0);
  const revenueWeek = paid
    .filter((o) => new Date(o.created_at) >= new Date(startWeek))
    .reduce((s, o) => s + Number(o.amount), 0);
  const revenueMonth = paid
    .filter((o) => new Date(o.created_at) >= new Date(startMonth))
    .reduce((s, o) => s + Number(o.amount), 0);

  const pendingOrders = orderRows
    .filter((o) => o.payment_status === "pending")
    .slice(0, 6);

  const recentOrders = orderRows.slice(0, 5);

  const availableCount = productRows.filter((p) => p.status === "available").length;
  const soldCount = productRows.filter((p) => p.status === "sold").length;

  const recentThreadsMap = new Map<string, MessageRow>();
  messageRows.forEach((m) => {
    if (!recentThreadsMap.has(m.user_email)) {
      recentThreadsMap.set(m.user_email, m);
    }
  });
  const recentThreads = Array.from(recentThreadsMap.values()).slice(0, 4);

  const productById = new Map(productRows.map((p) => [p.id, p]));

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Dashboard</h1>
          <p className="mt-2 text-sm text-white/45">
            {now.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · live overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <Link
            href="/admin/products"
            className="rounded-sm border border-white/15 px-3 py-2 text-white/80 transition hover:border-white hover:text-white"
          >
            + New product
          </Link>
          <Link
            href="/"
            target="_blank"
            className="rounded-sm bg-white px-3 py-2 font-semibold text-black transition hover:bg-gold-200"
          >
            View storefront ↗
          </Link>
        </div>
      </div>

      {/* ---------- Revenue ---------- */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Revenue today"
          value={formatPrice(revenueToday)}
          sub={`${
            paid.filter((o) => new Date(o.created_at) >= new Date(startToday)).length
          } paid orders`}
          accent
        />
        <Kpi
          label="Last 7 days"
          value={formatPrice(revenueWeek)}
          sub={`${
            paid.filter((o) => new Date(o.created_at) >= new Date(startWeek)).length
          } orders`}
        />
        <Kpi
          label="Last 30 days"
          value={formatPrice(revenueMonth)}
          sub={`${
            paid.filter((o) => new Date(o.created_at) >= new Date(startMonth)).length
          } orders`}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi small label="Available" value={String(availableCount)} sub="in stock" />
        <Kpi small label="Sold" value={String(soldCount)} sub="all-time" />
        <Kpi
          small
          label="Pending verify"
          value={String(pendingCount ?? 0)}
          sub="awaiting payment"
          tone={pendingCount && pendingCount > 0 ? "warn" : undefined}
        />
        <Kpi
          small
          label="Unread messages"
          value={String(unreadCount ?? 0)}
          sub="needs reply"
          tone={unreadCount && unreadCount > 0 ? "warn" : undefined}
        />
      </div>

      {/* ---------- Action panels ---------- */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* Pending orders */}
        <Panel
          title="Pending payments"
          href="/admin/orders"
          cta={`View all ${pendingCount ?? 0} →`}
          empty="All orders verified. Nothing waiting."
          isEmpty={pendingOrders.length === 0}
        >
          <ul className="divide-y divide-white/5">
            {pendingOrders.map((o) => {
              const product = o.product_id ? productById.get(o.product_id) : null;
              return (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {product?.name ?? "Order"} ·{" "}
                        <span className="text-gold-200">
                          {formatPrice(Number(o.amount))}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/50">
                        {o.customer_name ?? o.email ?? "no customer info"} ·{" "}
                        {o.payment_method ?? "—"} · {formatRelative(o.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gold-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-gold-200">
                      pending
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Recent orders */}
        <Panel
          title="Recent orders"
          href="/admin/orders"
          cta="See all →"
          empty="No orders yet."
          isEmpty={recentOrders.length === 0}
        >
          <ul className="divide-y divide-white/5">
            {recentOrders.map((o) => {
              const product = o.product_id ? productById.get(o.product_id) : null;
              return (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">
                        {product?.name ?? "Order"} · {formatPrice(Number(o.amount))}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/45">
                        {o.payment_method ?? "—"} · {formatRelative(o.created_at)}
                      </p>
                    </div>
                    <StatusPill status={o.payment_status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Recent messages */}
        <Panel
          title="Recent messages"
          href="/admin/messages"
          cta="Open inbox →"
          empty="No messages yet."
          isEmpty={recentThreads.length === 0}
        >
          <ul className="divide-y divide-white/5">
            {recentThreads.map((m) => (
              <li key={m.user_email} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {m.user_name ?? m.user_email}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50">
                      {m.sender === "admin" ? (
                        <span className="text-white/35">You: </span>
                      ) : null}
                      {m.message}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-white/35">
                    {formatRelative(m.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  small,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  small?: boolean;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-sm border bg-zinc-950/80 px-5 py-5 transition hover:border-gold-500/30 ${
        accent ? "border-gold-400/30" : "border-white/10"
      } ${tone === "warn" ? "ring-1 ring-gold-400/20" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p
        className={`mt-3 font-display text-white ${
          small ? "text-2xl" : "text-3xl"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-white/40">{sub}</p> : null}
    </div>
  );
}

function Panel({
  title,
  href,
  cta,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-white/10 bg-zinc-950/80">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.18em] text-white/55">{title}</p>
        <Link
          href={href}
          className="text-[10px] uppercase tracking-[0.18em] text-gold-300 hover:text-gold-200"
        >
          {cta}
        </Link>
      </div>
      {isEmpty ? (
        <p className="px-4 py-8 text-center text-xs text-white/35">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-300",
    pending: "bg-gold-400/15 text-gold-200",
    cancelled: "bg-red-500/15 text-red-300",
    expired: "bg-white/10 text-white/50",
    refunded: "bg-blue-500/15 text-blue-300",
  };
  const cls = map[status ?? ""] ?? "bg-white/10 text-white/60";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] ${cls}`}
    >
      {status ?? "—"}
    </span>
  );
}
