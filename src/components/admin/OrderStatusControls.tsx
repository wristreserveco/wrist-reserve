"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  orderId: string;
  status: string;
}

export function OrderStatusControls({ orderId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function update(markPaid: boolean) {
    setError(null);
    const res = await fetch("/api/admin/orders/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, markPaid }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "Failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (status === "paid") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => void update(false)}
        className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/50 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-40"
      >
        Cancel
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void update(true)}
        className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-40"
      >
        Mark paid
      </button>
      {error ? (
        <p className="text-[10px] text-red-300/80">{error}</p>
      ) : null}
    </div>
  );
}
