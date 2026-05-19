"use client";

import { useEffect, useState } from "react";
import { createClient, isBrowserSupabaseReady } from "@/lib/supabase/client";

interface Props {
  orderId: string;
  /** Server decides: paid order with an email on file. */
  show: boolean;
}

/**
 * Soft upsell after checkout: magic link to the same email as the order.
 * Hidden when the buyer is already signed in with Supabase.
 */
export function OptionalAccountNudge({ orderId, show }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      setSignedIn(false);
      return;
    }
    if (!isBrowserSupabaseReady()) {
      setSignedIn(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(Boolean(session?.user?.email));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user?.email));
    });
    return () => subscription.unsubscribe();
  }, [show]);

  if (!show) return null;
  if (signedIn === null) return null;
  if (signedIn) return null;

  async function requestLink() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/checkout/order-account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        retryAfterSec?: number;
      };
      if (res.status === 429) {
        setError(
          data.error ||
            `Please wait ${data.retryAfterSec ?? 60} seconds before trying again.`
        );
        return;
      }
      if (data.message) {
        setNote(data.message);
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not send the link. Try again later.");
        return;
      }
      setNote(
        "Check your email (and spam) for a sign-in link. It only goes to the address we have for this order."
      );
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-sm border border-white/[0.06] bg-white/[0.02] px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.26em] text-white/35">
        Optional
      </p>
      <p className="mt-2 text-sm text-white/60">
        Want a saved sign-in for next time? We can email you a one-tap link—no
        password to invent. Skip this if you prefer; your order is already
        confirmed.
      </p>
      {note ? (
        <p className="mt-3 text-xs text-emerald-200/90">{note}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-red-200/90">{error}</p>
      ) : null}
      {!note ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void requestLink()}
          className="mt-4 rounded-sm border border-white/15 bg-transparent px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/35 hover:text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      ) : null}
    </div>
  );
}
