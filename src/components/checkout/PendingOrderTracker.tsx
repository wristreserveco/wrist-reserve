"use client";

/**
 * Live status panel shown on /checkout/pending/[orderId].
 *
 * Both PayPal and Crypto checkouts redirect here. PayPal lands `paid` almost
 * immediately (capture happens server-side on /checkout/paypal/return);
 * Crypto stays `pending` until NOWPayments fires the IPN. We poll every
 * few seconds so the page reacts the moment funds clear.
 */

import { useEffect, useState } from "react";
import { formatEvent, type OrderEventKind } from "@/lib/orders/events";

interface TimelineEvent {
  id: string;
  kind: string;
  message: string | null;
  actor: string;
  created_at: string;
}

interface StatusResponse {
  id: string;
  status: "pending" | "paid" | "cancelled" | "expired" | "refunded";
  method: "crypto" | "paypal" | null;
  amount: number;
  amountDisplay: string;
  memo: string;
  productName: string | null;
  customerName: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  trackingStatus: string | null;
  shippedAt: string | null;
  events: TimelineEvent[];
}

const POLL_MS = 5000;

function timeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PendingOrderTracker({ orderId }: { orderId: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as StatusResponse;
        if (!cancelled) setData(next);
      } catch {
        // ignore transient failures
      }
    }

    void tick();
    const i = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [orderId]);

  const status = data?.status ?? "pending";

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Status
          </span>
          <StatusPill status={status} />
        </div>

        {status === "pending" ? (
          <div className="mt-6 space-y-4 text-sm text-white/70">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
              </span>
              <span className="text-white">
                {data?.method === "crypto"
                  ? "Awaiting on-chain confirmation"
                  : "Awaiting payment confirmation"}
                {data?.memo ? (
                  <>
                    {" "}— ref{" "}
                    <span className="rounded-sm bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">
                      {data.memo}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            <p className="text-xs text-white/50">
              {data?.method === "crypto"
                ? "Crypto payments usually confirm in under 10 minutes. We'll ship the moment your transaction is final."
                : "We ship within 2 hours of confirmation during business hours (9am–11pm ET). This page updates live."}
            </p>
          </div>
        ) : null}

        {status === "paid" ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                ✓
              </span>
              <span className="text-base">
                {data?.shippedAt ? "Payment received — shipped" : "Payment received — shipping today"}
              </span>
            </div>
            {data?.trackingNumber ? (
              <div className="space-y-1">
                <p className="text-sm text-white/70">
                  <span className="text-white/50">Tracking:</span>{" "}
                  <span className="font-mono text-white">
                    {data.trackingCarrier ? `${data.trackingCarrier} · ` : ""}
                    {data.trackingNumber}
                  </span>
                </p>
                {data.trackingUrl ? (
                  <a
                    href={data.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-gold-300 underline decoration-dotted hover:text-gold-200"
                  >
                    Track shipment ↗
                  </a>
                ) : null}
                {data.trackingStatus && data.trackingStatus !== "PRE_TRANSIT" ? (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {data.trackingStatus.replace(/_/g, " ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-white/50">
                Tracked + insured worldwide. Tracking number arrives by email
                within a few hours.
              </p>
            )}
          </div>
        ) : null}

        {status === "cancelled" || status === "expired" ? (
          <p className="mt-6 text-sm text-white/70">
            This order was {status}. If this is a mistake, reach us via chat at the
            bottom right and we&rsquo;ll sort it immediately.
          </p>
        ) : null}
      </div>

      {/* Timeline */}
      {data && data.events.length > 0 ? (
        <div className="rounded-sm border border-white/10 bg-zinc-950/40 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
            Timeline
          </p>
          <ol className="mt-4 space-y-4">
            {data.events.map((ev) => {
              const { label, icon } = formatEvent(ev.kind as OrderEventKind);
              return (
                <li key={ev.id} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black text-[11px] text-gold-300">
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/90">{label}</p>
                    {ev.message ? (
                      <p className="mt-0.5 text-xs text-white/50">{ev.message}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-white/30">
                      {timeShort(ev.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-gold-400/40 bg-gold-400/10 text-gold-200",
    paid: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    cancelled: "border-red-400/40 bg-red-400/10 text-red-200",
    expired: "border-red-400/40 bg-red-400/10 text-red-200",
    refunded: "border-white/20 bg-white/5 text-white/60",
  };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
        map[status] ?? "border-white/20 text-white/60"
      }`}
    >
      {status}
    </span>
  );
}
