"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

interface Props {
  q: string;
  status: string;
  tabs: Array<{ key: string; label: string }>;
}

export function AdminOrdersSearch({ q, status, tabs }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [local, setLocal] = useState(q);
  const [pending, startTransition] = useTransition();

  useEffect(() => setLocal(q), [q]);

  const push = useCallback(
    (next: URLSearchParams) => {
      startTransition(() => {
        const qs = next.toString();
        router.push(`/admin/orders${qs ? `?${qs}` : ""}`);
      });
    },
    [router]
  );

  // Debounced search submit on typing.
  useEffect(() => {
    if (local === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (local) next.set("q", local);
      else next.delete("q");
      push(next);
    }, 300);
    return () => clearTimeout(t);
  }, [local, q, params, push]);

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = status === t.key;
          const next = new URLSearchParams(params.toString());
          if (t.key) next.set("status", t.key);
          else next.delete("status");
          const qs = next.toString();
          return (
            <Link
              key={t.key || "all"}
              href={`/admin/orders${qs ? `?${qs}` : ""}`}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] transition ${
                active
                  ? "border-gold-400/60 bg-gold-400/10 text-gold-100"
                  : "border-white/10 text-white/55 hover:border-white/30 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="relative w-full sm:w-72">
        <input
          type="search"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Search memo, name, email, tracking…"
          disabled={pending}
          className="w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
        />
      </div>
    </div>
  );
}
