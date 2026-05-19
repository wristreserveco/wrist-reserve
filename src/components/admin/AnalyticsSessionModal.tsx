"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatMs,
  isLiveSession,
  parseUserAgent,
  pathWithQuery,
  referrerLabel,
} from "@/lib/analytics/display";

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
type SiblingRow = {
  session_public_id: string;
  started_at: string;
  last_activity_at: string;
  page_view_count: number;
  landing_path: string | null;
  exit_path: string | null;
  referrer: string | null;
  engaged_ms: number;
  capture_email: string | null;
};

function fmtDuration(ms: number) {
  return formatMs(ms);
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-black/30 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        {label}
      </dt>
      <dd
        className={`mt-1 text-white/85 ${mono ? "break-all font-mono text-[11px]" : "text-xs"}`}
      >
        {value}
      </dd>
    </div>
  );
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
  const [siblings, setSiblings] = useState<SiblingRow[]>([]);
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
        siblingSessions?: SiblingRow[];
      };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setSession(null);
        setViews([]);
        setSiblings([]);
        return;
      }
      const s = data.session ?? null;
      setSession(s);
      setViews(data.views ?? []);
      setSiblings(data.siblingSessions ?? []);
      if (s) {
        setNotes(String(s.admin_notes ?? ""));
        setTags(
          Array.isArray(s.admin_tags) ? (s.admin_tags as string[]).join(", ") : ""
        );
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
  const ua = parseUserAgent(session?.user_agent as string | undefined);
  const live =
    session?.last_activity_at &&
    isLiveSession(String(session.last_activity_at));

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

  const utmParts = [
    session?.utm_source,
    session?.utm_medium,
    session?.utm_campaign,
    session?.utm_content,
    session?.utm_term,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-gold-500/25 bg-zinc-950 p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
              Session journey
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/70">{publicId}</p>
            {live ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Active in last 15 minutes
              </p>
            ) : null}
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
            <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <Detail
                label="Visitor id"
                value={String(session.visitor_id ?? "")}
                mono
              />
              <Detail
                label="Started"
                value={new Date(String(session.started_at)).toLocaleString()}
              />
              <Detail
                label="Last activity"
                value={new Date(String(session.last_activity_at)).toLocaleString()}
              />
              <Detail
                label="Wall-clock duration"
                value={fmtDuration(
                  Math.max(
                    0,
                    new Date(String(session.last_activity_at)).getTime() -
                      new Date(String(session.started_at)).getTime()
                  )
                )}
              />
              <Detail
                label="Engaged (tab active)"
                value={
                  <>
                    {fmtDuration(approxSessionMs)}{" "}
                    <span className="text-white/40">
                      pulses {fmtDuration(engaged)} + dwell {fmtDuration(dwellTotal)}
                    </span>
                  </>
                }
              />
              <Detail
                label="Page views"
                value={String(session.page_view_count ?? views.length)}
              />
              <Detail label="Browser" value={ua.browser} />
              <Detail label="OS" value={ua.os} />
              <Detail
                label="Device"
                value={ua.device.charAt(0).toUpperCase() + ua.device.slice(1)}
              />
              <Detail
                label="Viewport"
                value={
                  session.viewport_w && session.viewport_h
                    ? `${session.viewport_w} × ${session.viewport_h}`
                    : "—"
                }
              />
              <Detail
                label="Language"
                value={String(session.browser_language ?? "—")}
              />
              <Detail label="Timezone" value={String(session.timezone ?? "—")} />
              <Detail
                label="IP"
                value={String(session.client_ip ?? "—")}
                mono
              />
              <Detail
                label="Landing URL"
                value={pathWithQuery(
                  session.landing_path as string | null,
                  session.landing_query as string | null
                )}
                mono
              />
              <Detail
                label="Exit page"
                value={String(session.exit_path ?? "—")}
                mono
              />
              <Detail
                label="Referrer"
                value={
                  session.referrer ? (
                    <a
                      href={String(session.referrer)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-200/90 underline"
                    >
                      {referrerLabel(String(session.referrer))}
                    </a>
                  ) : (
                    "Direct / none"
                  )
                }
              />
              {utmParts.length > 0 ? (
                <Detail
                  label="UTM"
                  value={utmParts.map((x) => String(x)).join(" · ")}
                />
              ) : null}
            </dl>

            {siblings.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                  Other sessions (same visitor)
                </p>
                <ul className="mt-2 divide-y divide-white/10 rounded-sm border border-white/10">
                  {siblings.map((sib) => (
                    <li key={sib.session_public_id} className="px-3 py-2 text-xs">
                      <Link
                        href={`/admin/analytics?session=${encodeURIComponent(sib.session_public_id)}`}
                        className="font-mono text-gold-200/90 underline decoration-gold-500/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {sib.session_public_id.slice(0, 8)}…
                      </Link>
                      <span className="text-white/40">
                        {" "}
                        · {new Date(sib.started_at).toLocaleDateString()} ·{" "}
                        {sib.page_view_count} pages · {referrerLabel(sib.referrer)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                Page-by-page journey
              </p>
              <ol className="mt-2 space-y-3 border-l-2 border-gold-500/25 pl-4">
                {views.map((v, i) => (
                  <li key={v.id} className="relative text-xs">
                    <span className="absolute -left-[1.35rem] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-gold-500/40 bg-zinc-950 text-[9px] text-gold-200/90">
                      {i + 1}
                    </span>
                    {v.product_id ? (
                      <Link
                        href={`/products/${v.product_id}`}
                        target="_blank"
                        className="font-medium text-gold-200/95 underline decoration-gold-500/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {v.path}
                      </Link>
                    ) : (
                      <span className="font-medium text-white/90">{v.path}</span>
                    )}
                    {v.query_string ? (
                      <span className="text-white/40">?{v.query_string}</span>
                    ) : null}
                    {v.title ? (
                      <span className="mt-0.5 block text-[11px] text-white/45">
                        {v.title}
                      </span>
                    ) : null}
                    {v.product_id ? (
                      <span className="mt-0.5 block text-[10px] text-gold-300/70">
                        Product id: {v.product_id}
                      </span>
                    ) : null}
                    <span className="mt-1 block font-mono text-[10px] text-white/35">
                      {new Date(v.viewed_at).toLocaleString()}
                      {v.dwell_ms != null && v.dwell_ms > 0
                        ? ` · dwell ${fmtDuration(v.dwell_ms)}`
                        : " · dwell —"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {session.user_agent ? (
              <p className="break-all font-mono text-[10px] text-white/30">
                {String(session.user_agent)}
              </p>
            ) : null}

            <div className="border-t border-white/10 pt-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                Marketing & CRM
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40">
                  Email
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 sm:col-span-2">
                  Tags (comma-separated)
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 sm:col-span-2">
                  Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                    className="h-4 w-4 accent-gold-400"
                  />
                  Marketing opt-in recorded
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