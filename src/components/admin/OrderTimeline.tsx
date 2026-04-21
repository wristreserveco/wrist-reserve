"use client";

import { formatEvent, type OrderEventKind, type OrderEventRow } from "@/lib/orders/events";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderTimeline({ events }: { events: OrderEventRow[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-sm border border-white/10 bg-zinc-950/70 p-6">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
          Timeline
        </p>
        <p className="mt-4 text-sm text-white/40">
          No events yet. Events will appear as the order progresses.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-white/10 bg-zinc-950/70 p-6">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
        Timeline
      </p>
      <ol className="mt-5 space-y-5">
        {events.map((ev, i) => {
          const { label, icon } = formatEvent(ev.kind as OrderEventKind);
          return (
            <li key={ev.id} className="relative flex items-start gap-3">
              {i < events.length - 1 ? (
                <span className="absolute left-[11px] top-6 h-full w-px bg-white/10" />
              ) : null}
              <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black text-[11px] text-gold-300">
                {icon}
              </span>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm text-white">{label}</p>
                {ev.message ? (
                  <p className="mt-0.5 break-words text-xs text-white/55">
                    {ev.message}
                  </p>
                ) : null}
                <p className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                  <span>{formatTime(ev.created_at)}</span>
                  <span className="text-white/20">·</span>
                  <span>{ev.actor}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
