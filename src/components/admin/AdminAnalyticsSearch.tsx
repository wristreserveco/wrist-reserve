"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminAnalyticsSearch({ days }: { days: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(sp.toString());
    next.set("days", String(days));
    const trimmed = q.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    startTransition(() => {
      router.push(`/admin/analytics?${next.toString()}`);
    });
  }

  function clear() {
    setQ("");
    const next = new URLSearchParams(sp.toString());
    next.delete("q");
    startTransition(() => {
      router.push(`/admin/analytics?${next.toString()}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search email, referrer, visitor id, path, UTM…"
        className="min-w-[220px] flex-1 rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40 sm:max-w-md"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-sm border border-gold-400/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-200 transition hover:bg-gold-400/10 disabled:opacity-40"
      >
        Search
      </button>
      {sp.get("q") ? (
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="rounded-sm border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/45 transition hover:text-white disabled:opacity-40"
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
