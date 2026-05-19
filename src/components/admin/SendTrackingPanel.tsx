"use client";

/**
 * Admin panel for orders fulfilled OUTSIDE the Shippo auto-buy flow.
 *
 * Workflow: admin buys a label manually on Shippo (or any carrier portal),
 * then comes back here to:
 *   1. paste the tracking number,
 *   2. pick the carrier,
 *   3. upload the label PNG/PDF (optional),
 *   4. add a personal note (optional),
 *   5. hit "Send tracking → buyer".
 *
 * One click does everything: saves the tracking on the order, marks it
 * shipped, stores the label in our storage bucket, and emails the buyer
 * via Resend. If email isn't configured (no RESEND_API_KEY) we still save
 * the tracking — the admin just gets a warning back.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orderId: string;
  status: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  existingTrackingNumber: string | null;
  existingCarrier: string | null;
  existingLabelUrl: string | null;
  existingTrackingUrl: string | null;
}

const CARRIERS: { value: string; label: string }[] = [
  { value: "usps", label: "USPS" },
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "dhl", label: "DHL" },
  { value: "other", label: "Other" },
];

export function SendTrackingPanel({
  orderId,
  status,
  customerEmail,
  customerName,
  customerPhone,
  existingTrackingNumber,
  existingCarrier,
  existingLabelUrl,
  existingTrackingUrl,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tracking, setTracking] = useState(existingTrackingNumber ?? "");
  const [carrier, setCarrier] = useState(existingCarrier?.toLowerCase() || "usps");
  const [message, setMessage] = useState("");
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [skipEmail, setSkipEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    tone: "success" | "warn" | "error";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPaid = status === "paid" || status === "shipped";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const trimmed = tracking.trim();
    if (!trimmed) {
      setResult({
        ok: false,
        tone: "error",
        text: "Tracking number is required.",
      });
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("tracking_number", trimmed);
      fd.set("carrier", carrier);
      if (message.trim()) fd.set("message", message.trim());
      if (skipEmail) fd.set("skip_email", "1");
      if (labelFile) fd.set("label", labelFile);

      const res = await fetch(`/api/admin/orders/${orderId}/send-tracking`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            email?: {
              status:
                | "sent"
                | "skipped"
                | "no_recipient"
                | "not_configured"
                | "failed";
              error?: string | null;
            };
            sms?: {
              status:
                | "sent"
                | "skipped"
                | "no_recipient"
                | "not_configured"
                | "invalid_phone"
                | "failed";
              error?: string | null;
            };
          }
        | null;

      if (!res.ok || !data?.ok) {
        setResult({
          ok: false,
          tone: "error",
          text: data?.error ?? "Something went wrong.",
        });
        return;
      }

      // Compose a single human-readable line summarizing both rails.
      let toneRes: "success" | "warn" = "success";
      const lines: string[] = [];
      const e = data.email;
      const s = data.sms;
      if (skipEmail) {
        lines.push("Tracking saved. No buyer notifications sent.");
      } else {
        // Email half.
        if (e?.status === "sent") {
          lines.push(`Email → ${customerEmail}.`);
        } else if (e?.status === "no_recipient") {
          toneRes = "warn";
          lines.push("Email skipped — no email on file.");
        } else if (e?.status === "not_configured") {
          toneRes = "warn";
          lines.push("Email skipped — Resend not configured.");
        } else if (e?.status === "failed") {
          toneRes = "warn";
          lines.push(`Email failed: ${e.error ?? "unknown error"}.`);
        }
        // SMS half.
        if (s?.status === "sent") {
          lines.push("SMS → buyer's phone.");
        } else if (s?.status === "no_recipient") {
          // Phone is optional — totally fine, don't even warn.
          lines.push("No phone on file, SMS skipped.");
        } else if (s?.status === "invalid_phone") {
          toneRes = "warn";
          lines.push("SMS skipped — phone number couldn't be parsed.");
        } else if (s?.status === "not_configured") {
          // Soft warn — admin probably doesn't have Twilio set up yet.
          lines.push("SMS skipped — Twilio not configured.");
        } else if (s?.status === "failed") {
          toneRes = "warn";
          lines.push(`SMS failed: ${s.error ?? "unknown error"}.`);
        }
      }
      setResult({
        ok: true,
        tone: toneRes,
        text: `Tracking saved & order marked shipped. ${lines.join(" ")}`.trim(),
      });
      setLabelFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setMessage("");
      startTransition(() => router.refresh());
    } catch (e) {
      setResult({
        ok: false,
        tone: "error",
        text: e instanceof Error ? e.message : "Network error.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-sm border border-white/10 bg-zinc-950/70 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
            Send tracking → buyer
          </p>
          <p className="mt-1 text-xs text-white/40">
            Bought the label manually? Paste tracking + drop the label, and
            we&rsquo;ll notify the buyer.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.18em]">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/65">
              Email · {customerEmail ?? "—"}
            </span>
            {customerPhone ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/5 px-2 py-0.5 text-emerald-200/80">
                SMS · {customerPhone}
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-white/35">
                SMS · no phone on file
              </span>
            )}
          </div>
        </div>
      </div>

      {!isPaid ? (
        <p className="rounded-sm border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200">
          Mark this order paid first, then come back to send tracking.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
            Carrier
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              disabled={busy || !isPaid}
              className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40 disabled:opacity-40"
            >
              {CARRIERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
            Tracking number
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="1Z… / 9400… / 7…"
              disabled={busy || !isPaid}
              className="rounded-sm border border-white/10 bg-black px-3 py-2 font-mono text-sm tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40 disabled:opacity-40"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
          Label image / PDF (optional)
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={busy || !isPaid}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setLabelFile(f);
            }}
            className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white file:mr-3 file:rounded-sm file:border file:border-white/10 file:bg-white/5 file:px-2 file:py-1 file:text-[11px] file:uppercase file:tracking-[0.18em] file:text-white/70 disabled:opacity-40"
          />
          {labelFile ? (
            <span className="text-[10px] text-white/50">
              {labelFile.name} · {(labelFile.size / 1024).toFixed(0)} KB
            </span>
          ) : existingLabelUrl ? (
            <span className="text-[10px] text-white/40">
              Currently on file:{" "}
              <a
                href={existingLabelUrl}
                target="_blank"
                rel="noreferrer"
                className="text-gold-300 underline-offset-2 hover:underline"
              >
                view label
              </a>
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
          Personal note (optional)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Hand-packed today${customerName ? `, ${customerName.split(" ")[0]}` : ""}. Reply if anything looks off.`}
            rows={3}
            disabled={busy || !isPaid}
            className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40 disabled:opacity-40"
          />
        </label>

        <label className="flex items-center gap-2 text-[11px] text-white/55">
          <input
            type="checkbox"
            checked={skipEmail}
            onChange={(e) => setSkipEmail(e.target.checked)}
            disabled={busy || !isPaid}
            className="h-3.5 w-3.5"
          />
          Don&rsquo;t email — just save tracking
        </label>

        {existingTrackingUrl ? (
          <p className="text-[10px] text-white/40">
            Existing tracking link:{" "}
            <a
              href={existingTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-gold-300 underline-offset-2 hover:underline"
            >
              {existingTrackingUrl.slice(0, 60)}
              {existingTrackingUrl.length > 60 ? "…" : ""}
            </a>
          </p>
        ) : null}

        {result ? (
          <p
            className={`rounded-sm px-3 py-2 text-xs ${
              result.tone === "error"
                ? "border border-red-400/30 bg-red-400/5 text-red-200"
                : result.tone === "warn"
                ? "border border-amber-400/30 bg-amber-400/5 text-amber-200"
                : "border border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
            }`}
          >
            {result.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !isPaid}
          className="w-full rounded-sm bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy
            ? "Sending…"
            : skipEmail
            ? "Save tracking"
            : "Save + email buyer"}
        </button>
      </form>
    </section>
  );
}
