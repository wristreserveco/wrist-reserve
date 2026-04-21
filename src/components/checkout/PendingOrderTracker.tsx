"use client";

import { useEffect, useRef, useState } from "react";
import { PaymentQR } from "@/components/payments/PaymentQR";
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
  method: "crypto" | "manual" | "stripe" | null;
  methodRef: string | null;
  amount: number;
  amountDisplay: string;
  memo: string;
  productName: string | null;
  customerName: string | null;
  handle: string | null;
  deepLink: string | null;
  qrValue: string | null;
  qrImageUrl: string | null;
  proofUrl: string | null;
  proofMime: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function uploadProof(file: File) {
    setUploadError(null);
    if (file.size > 15 * 1024 * 1024) {
      setUploadError("File is too large (15MB max).");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/orders/${orderId}/proof`, {
        method: "POST",
        body: form,
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setUploadError(out.error ?? "Upload failed.");
      }
    } catch {
      setUploadError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

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
                Watching for your payment
                {data?.memo ? (
                  <>
                    {" "}with memo{" "}
                    <span className="rounded-sm bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">
                      {data.memo}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            <p className="text-xs text-white/50">
              We verify and ship within 2 hours during business hours (9am–11pm ET).
              You&rsquo;ll receive a shipping confirmation email the moment the funds
              clear — this page also updates live.
            </p>

            {data &&
            data.method === "manual" &&
            data.methodRef === "square" &&
            data.deepLink ? (
              <a
                href={data.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200"
              >
                Pay {data.amountDisplay} with card via Square →
              </a>
            ) : null}

            {data && data.method === "manual" && (data.qrValue || data.qrImageUrl) ? (
              <div className="mt-5 flex flex-col items-start gap-4 rounded-sm border border-white/10 bg-black/40 p-4 sm:flex-row">
                <PaymentQR
                  value={data.qrValue}
                  imageUrl={data.qrImageUrl}
                  caption={
                    data.methodRef === "cashapp"
                      ? "Scan with phone camera"
                      : "Scan with your bank app"
                  }
                  size={140}
                />
                <div className="space-y-1.5 text-xs">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">
                    Need to resend?
                  </p>
                  {data.handle ? (
                    <p className="text-white">
                      <span className="text-white/50">To:</span>{" "}
                      <span className="font-mono">{data.handle}</span>
                    </p>
                  ) : null}
                  <p className="text-white">
                    <span className="text-white/50">Amount:</span>{" "}
                    {data.amountDisplay}
                  </p>
                  <p className="text-white">
                    <span className="text-white/50">Memo:</span>{" "}
                    <span className="font-mono">{data.memo}</span>
                  </p>
                </div>
              </div>
            ) : null}
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
              <p className="text-sm text-white/70">
                <span className="text-white/50">Tracking:</span>{" "}
                <span className="font-mono text-white">
                  {data.trackingCarrier ? `${data.trackingCarrier} · ` : ""}
                  {data.trackingNumber}
                </span>
              </p>
            ) : (
              <p className="text-xs text-white/50">
                Tracked + insured via FedEx Priority. Tracking number arrives by email
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

      {/* -------- Proof of payment upload (manual orders only, while pending) -------- */}
      {status === "pending" && data?.method === "manual" ? (
        <div className="rounded-sm border border-white/10 bg-zinc-950/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-400/90">
                Speed things up
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                Attach your payment screenshot
              </p>
              <p className="mt-1 text-xs text-white/50">
                Drop the Zelle / Cash App receipt here so we can cross-check and release
                your watch faster. JPG, PNG, or PDF · 15MB max.
              </p>
            </div>
          </div>

          {data.proofUrl ? (
            <div className="mt-5 flex items-center gap-4 rounded-sm border border-emerald-400/30 bg-emerald-400/5 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                ✓
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-white">Proof received — we&rsquo;ll review within minutes.</p>
                <a
                  href={data.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gold-300 underline decoration-dotted hover:text-gold-200"
                >
                  View uploaded file ↗
                </a>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-sm border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white hover:text-white disabled:opacity-40"
              >
                Replace
              </button>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-sm bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Upload receipt"}
              </button>
              <p className="text-[10px] text-white/40">
                Optional, but recommended.
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadProof(f);
            }}
          />

          {uploadError ? (
            <p className="mt-3 text-xs text-red-400/90">{uploadError}</p>
          ) : null}
        </div>
      ) : null}

      {/* -------- Timeline -------- */}
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
    pending:
      "border-gold-400/40 bg-gold-400/10 text-gold-200",
    paid:
      "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
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
