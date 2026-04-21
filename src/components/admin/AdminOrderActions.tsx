"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  orderId: string;
  status: string;
  initialNotes: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  verifiedAt: string | null;
  shippedAt: string | null;
}

type Action =
  | "set_notes"
  | "mark_shipped"
  | "update_tracking"
  | "mark_paid"
  | "cancel"
  | "refund";

export function AdminOrderActions({
  orderId,
  status,
  initialNotes,
  trackingNumber,
  trackingCarrier,
  verifiedAt,
  shippedAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [notesBusy, setNotesBusy] = useState(false);

  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [carrier, setCarrier] = useState(trackingCarrier ?? "");
  const [shipBusy, setShipBusy] = useState(false);

  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action, body: Record<string, unknown> = {}) {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Something went wrong.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onSaveNotes() {
    setNotesBusy(true);
    const ok = await run("set_notes", { notes });
    if (ok) setSavedNotes(notes);
    setNotesBusy(false);
  }

  async function onShip() {
    setShipBusy(true);
    await run("mark_shipped", {
      tracking_number: tracking.trim() || undefined,
      tracking_carrier: carrier.trim() || undefined,
    });
    setShipBusy(false);
  }

  async function onUpdateTracking() {
    setShipBusy(true);
    await run("update_tracking", {
      tracking_number: tracking.trim() || undefined,
      tracking_carrier: carrier.trim() || undefined,
    });
    setShipBusy(false);
  }

  const isPaid = status === "paid";
  const isPending = status === "pending";
  const isShipped = Boolean(shippedAt);
  const notesDirty = notes !== savedNotes;

  return (
    <section className="space-y-5 rounded-sm border border-white/10 bg-zinc-950/70 p-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
          Admin actions
        </p>
        {error ? (
          <p className="mt-2 text-xs text-red-300/90">{error}</p>
        ) : null}
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-3">
        {isPending ? (
          <button
            type="button"
            disabled={pending || busy !== null}
            onClick={() => void run("mark_paid")}
            className="rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-40"
          >
            {busy === "mark_paid" ? "Verifying…" : "Verify + mark paid"}
          </button>
        ) : null}

        {isPaid && !isShipped ? (
          <button
            type="button"
            disabled={pending || shipBusy}
            onClick={() => void onShip()}
            className="rounded-sm bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-40"
          >
            {shipBusy ? "Saving…" : "Mark shipped"}
          </button>
        ) : null}

        {isPaid ? (
          <button
            type="button"
            disabled={pending || busy !== null}
            onClick={() => {
              if (
                confirm(
                  "Mark this order refunded? This won't trigger an automatic refund — do that in your payment app first."
                )
              ) {
                void run("refund");
              }
            }}
            className="rounded-sm border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white hover:text-white disabled:opacity-40"
          >
            {busy === "refund" ? "Saving…" : "Mark refunded"}
          </button>
        ) : null}

        {isPending ? (
          <button
            type="button"
            disabled={pending || busy !== null}
            onClick={() => {
              if (confirm("Cancel this order? The customer will see it as cancelled.")) {
                void run("cancel");
              }
            }}
            className="rounded-sm border border-red-400/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-red-200 transition hover:bg-red-400/10 disabled:opacity-40"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel order"}
          </button>
        ) : null}
      </div>

      {/* Shipping / tracking */}
      {isPaid ? (
        <div className="space-y-3 rounded-sm border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
            Fulfillment
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
              Carrier
              <input
                type="text"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="FedEx, UPS, USPS…"
                className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
              Tracking number
              <input
                type="text"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="1Z…"
                className="rounded-sm border border-white/10 bg-black px-3 py-2 font-mono text-sm tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
          </div>
          {isShipped ? (
            <button
              type="button"
              disabled={shipBusy}
              onClick={() => void onUpdateTracking()}
              className="rounded-sm border border-white/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white hover:text-white disabled:opacity-40"
            >
              {shipBusy ? "Saving…" : "Update tracking"}
            </button>
          ) : null}
          {shippedAt ? (
            <p className="text-[10px] text-white/40">
              Shipped {new Date(shippedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Admin notes */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/45">
          Admin notes (private)
          {notesDirty ? (
            <span className="text-gold-300">Unsaved</span>
          ) : null}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Zelle received @ 2:14pm, BoA ending 4421. Called buyer to confirm…"
          rows={3}
          className="w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
        />
        <button
          type="button"
          disabled={!notesDirty || notesBusy}
          onClick={() => void onSaveNotes()}
          className="rounded-sm border border-white/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white hover:text-white disabled:opacity-30"
        >
          {notesBusy ? "Saving…" : "Save notes"}
        </button>
      </div>

      {verifiedAt ? (
        <p className="text-[10px] text-white/40">
          Verified {new Date(verifiedAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}
