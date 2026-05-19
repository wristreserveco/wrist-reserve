"use client";

import { useCallback, useEffect, useState } from "react";

type SessionRow = Record<string, unknown>;
type ViewRow = {
  id: string;
  path: string;
  query_string: string | null;
  title: string | null;
  product_id: string | null;
  viewed_at: string;
  dwell_ms: number | null;
};

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function AnalyticsSessionModal({
  publicId,
  onClose,
}: {
  publicId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!publicId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/analytics/session/${encodeURIComponent(publicId)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: SessionRow;
        views?: ViewRow[];
      };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setSession(null);
        setViews([]);
        return;
      }
      const s = data.session ?? null;
      setSession(s);
      setViews(data.views ?? []);
      if (s) {
        setNotes(String(s.admin_notes ?? ""));
        setTags(Array.isArray(s.admin_tags) ? (s.admin_tags as string[]).join(", ") : "");
        setEmail(String(s.capture_email ?? ""));
        setName(String(s.capture_name ?? ""));
        setOptIn(Boolean(s.marketing_opt_in));
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!publicId) return null;

  const engaged = Number(session?.engaged_ms ?? 0);
  const dwellTotal = views.reduce((a, v) => a + (v.dwell_ms ?? 0), 0);
  const approxSessionMs = engaged + dwellTotal;

  async function saveCrm() {
    if (!publicId) return;
    setSaving(true);
    setError(null);
    try {
      const tagList = tags
        .split(/[,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(
        `/api/admin/analytics/session/${encodeURIComponent(publicId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_notes: notes || null,
            admin_tags: tagList,
            capture_email: email.trim() || null,
            capture_name: name.trim() || null,
            marketing_opt_in: optIn,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      await load();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-gold-500/25 bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
              Session journey
            </p>
            <p className="mt-1 font-mono text-xs text-white/70">{publicId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60 transition hover:border-white/30 hover:text-white"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-white/45">Loading…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-300/90">{error}</p>
        ) : session ? (
          <div className="mt-6 space-y-6">
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-sm border border-white/10 bg-black/30 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Visitor id
                </dt>
                <dd className="mt-1 font-mono text-[11px] text-gold-200/90">
                  {String(session.visitor_id ?? "").slice(0, 36)}
                </dd>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/30 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Approx. engaged time
                </dt>
                <dd className="mt-1 text-white/85">
                  {fmtDuration(approxSessionMs)}{" "}
                  <span className="text-white/40">
                    (pulses {fmtDuration(engaged)} + page dwell {fmtDuration(dwellTotal)})
                  </span>
                </dd>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/30 px-3 py-2 sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Acquisition
                </dt>
                <dd className="mt-1 text-white/70">
                  {session.referrer ? (
                    <span className="break-all">From: {String(session.referrer)}</span>
                  ) : (
                    <span className="text-white/40">Direct / unknown referrer</span>
                  )}
                  {Boolean(
                    session.utm_source || session.utm_medium || session.utm_campaign
                  ) ? (
                    <span className="mt-1 block text-gold-200/80">
                      UTM:{" "}
                      {[session.utm_source, session.utm_medium, session.utm_campaign]
                        .filter(Boolean)
                        .map((x) => String(x))
                        .join(" · ")}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                Page-by-page
              </p>
              <ol className="mt-2 space-y-2 border-l border-gold-500/20 pl-4">
                {views.map((v) => (
                  <li key={v.id} className="text-xs">
                    <span className="text-white/85">{v.path}</span>
                    {v.query_string ? (
                      <span className="text-white/40">?{v.query_string}</span>
                    ) : null}
                    {v.title ? (
                      <span className="mt-0.5 block text-[11px] text-white/45">
                        {v.title}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block font-mono text-[10px] text-white/35">
                      {new Date(v.viewed_at).toLocaleString()}{" "}
                      {v.dwell_ms != null && v.dwell_ms > 0
                        ? `· dwell ${fmtDuration(v.dwell_ms)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                Marketing & CRM
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                Only store contacts you have permission to use (orders, explicit opt-in,
                etc.). Use tags for segments (e.g. datejust-lead, ig-dm).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40">
                  Email
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    placeholder="buyer@email.com"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 sm:col-span-2">
                  Tags (comma-separated)
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    placeholder="hot-lead, repeat-viewer"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 sm:col-span-2">
                  Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    placeholder="Call Friday, sent IG price list…"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                    className="h-4 w-4 accent-gold-400"
                  />
                  Marketing opt-in recorded for this visitor
                </label>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveCrm()}
                className="mt-4 rounded-sm bg-gold-400 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-300 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save CRM fields"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-white/45">No data.</p>
        )}
      </div>
    </div>
  );
}
