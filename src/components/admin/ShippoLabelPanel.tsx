"use client";

/**
 * Shippo label-buying panel for the admin order detail page.
 * Flow:
 *   1. Admin reviews/edits the recipient address (best-effort prefilled
 *      from `shipping_address` text).
 *   2. Click Get rates → POST /api/admin/orders/:id/shipping/rates.
 *   3. Pick a rate → POST /api/admin/orders/:id/shipping/buy.
 *   4. Panel shows the printable label URL + tracking + status.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

interface ShippoRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string; token: string };
  estimated_days: number | null;
  duration_terms: string | null;
  attributes?: string[];
}

interface Props {
  orderId: string;
  orderStatus?: string;
  declaredValueUsd: number;
  quantity: number;
  shippingAddress: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  existingLabelUrl: string | null;
  existingTrackingNumber: string | null;
  existingTrackingUrl: string | null;
  existingTrackingStatus: string | null;
  existingShippingService: string | null;
}

export function ShippoLabelPanel(props: Props) {
  const router = useRouter();
  const initialAddress = useMemo(
    () => parseShippingAddress(props.shippingAddress, props.customerName),
    [props.shippingAddress, props.customerName]
  );

  const [address, setAddress] = useState<Address>({
    ...initialAddress,
    phone: props.customerPhone ?? initialAddress.phone,
    email: props.customerEmail ?? initialAddress.email,
  });

  const [rates, setRates] = useState<ShippoRate[] | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buyingRateId, setBuyingRateId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [signatureRequired, setSignatureRequired] = useState(
    props.declaredValueUsd >= 500
  );

  const hasLabel = Boolean(props.existingLabelUrl);
  const status = (props.orderStatus ?? "").toLowerCase();
  const actionable = status === "paid" || hasLabel;
  const blockedReason =
    !actionable && status === "pending"
      ? "Waiting on payment to clear. Once the order is marked paid, you can fetch rates and buy a label here."
      : !actionable && (status === "cancelled" || status === "expired")
      ? "Order was " + status + ". No label needed."
      : !actionable && status === "refunded"
      ? "Order was refunded. No label needed."
      : null;

  async function onGetRates() {
    setLoadingRates(true);
    setRatesError(null);
    setRates(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${props.orderId}/shipping/rates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: address,
            quantity: props.quantity,
          }),
        }
      );
      const json = (await res.json()) as
        | { rates: ShippoRate[]; messages?: { text: string }[] }
        | { error: string };
      if (!res.ok || "error" in json) {
        setRatesError(("error" in json && json.error) || "Failed to fetch rates");
        return;
      }
      setRates(json.rates ?? []);
    } catch {
      setRatesError("Network error fetching rates.");
    } finally {
      setLoadingRates(false);
    }
  }

  async function onBuyLabel(rate: ShippoRate) {
    if (!confirm(`Buy this label? You'll be charged ${rate.amount} ${rate.currency} via Shippo.`)) {
      return;
    }
    setBuyingRateId(rate.object_id);
    setBuyError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${props.orderId}/shipping/buy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rate_id: rate.object_id,
            declared_value_usd: props.declaredValueUsd,
            signature_required: signatureRequired,
          }),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        setBuyError(json.error ?? "Failed to buy label");
        return;
      }
      router.refresh();
    } catch {
      setBuyError("Network error.");
    } finally {
      setBuyingRateId(null);
    }
  }

  return (
    <section className="space-y-5 rounded-sm border border-white/10 bg-zinc-950/70 p-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
          Shipping label · Shippo
        </p>
        {hasLabel ? (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
            Label issued
          </span>
        ) : actionable ? (
          <span className="rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold-200">
            Ready to ship
          </span>
        ) : (
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
            Not ready
          </span>
        )}
      </div>

      {hasLabel ? (
        <ExistingLabel
          labelUrl={props.existingLabelUrl!}
          trackingNumber={props.existingTrackingNumber}
          trackingUrl={props.existingTrackingUrl}
          trackingStatus={props.existingTrackingStatus}
          service={props.existingShippingService}
        />
      ) : null}

      {blockedReason ? (
        <div className="rounded-sm border border-white/10 bg-black/30 p-4 text-xs text-white/55">
          {blockedReason}
        </div>
      ) : null}

      {/* Address editor — always visible (even when not actionable) so the
          admin can confirm the recipient address is even there. */}
      <details open={actionable && !hasLabel} className="space-y-3">
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-white/55 hover:text-white">
          Recipient address
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={address.name}
              onChange={(v) => setAddress({ ...address, name: v })}
            />
          </Field>
          <Field label="Company (optional)">
            <Input
              value={address.company ?? ""}
              onChange={(v) => setAddress({ ...address, company: v })}
            />
          </Field>
          <Field label="Street" wide>
            <Input
              value={address.street1}
              onChange={(v) => setAddress({ ...address, street1: v })}
            />
          </Field>
          <Field label="Street 2 / Apt (optional)" wide>
            <Input
              value={address.street2 ?? ""}
              onChange={(v) => setAddress({ ...address, street2: v })}
            />
          </Field>
          <Field label="City">
            <Input
              value={address.city}
              onChange={(v) => setAddress({ ...address, city: v })}
            />
          </Field>
          <Field label="State / Province">
            <Input
              value={address.state}
              onChange={(v) => setAddress({ ...address, state: v })}
            />
          </Field>
          <Field label="Postal code">
            <Input
              value={address.zip}
              onChange={(v) => setAddress({ ...address, zip: v })}
            />
          </Field>
          <Field label="Country">
            <Input
              value={address.country}
              onChange={(v) =>
                setAddress({ ...address, country: v.toUpperCase().slice(0, 2) })
              }
              placeholder="US"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={address.phone ?? ""}
              onChange={(v) => setAddress({ ...address, phone: v })}
            />
          </Field>
          <Field label="Email">
            <Input
              value={address.email ?? ""}
              onChange={(v) => setAddress({ ...address, email: v })}
            />
          </Field>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            checked={signatureRequired}
            onChange={(e) => setSignatureRequired(e.target.checked)}
            className="h-3.5 w-3.5 accent-gold-500"
          />
          Require signature on delivery
          <span className="text-white/35">
            (recommended for orders ≥ $500)
          </span>
        </label>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            disabled={
              !actionable ||
              loadingRates ||
              !address.street1 ||
              !address.city ||
              !address.zip
            }
            onClick={() => void onGetRates()}
            className="rounded-sm border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:border-white hover:bg-white/10 disabled:opacity-40"
          >
            {loadingRates ? "Fetching rates…" : hasLabel ? "Re-quote shipping" : "Get rates"}
          </button>
        </div>

        {ratesError ? (
          <p className="mt-3 text-xs text-red-300/90">{ratesError}</p>
        ) : null}
      </details>

      {rates && rates.length === 0 ? (
        <p className="text-xs text-white/45">
          No rates returned. Check the address and try again.
        </p>
      ) : null}

      {rates && rates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
            Pick a service ({rates.length} available)
          </p>
          <ul className="space-y-2">
            {rates.map((r) => {
              const busy = buyingRateId === r.object_id;
              return (
                <li
                  key={r.object_id}
                  className="flex items-center justify-between gap-4 rounded-sm border border-white/10 bg-black/30 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {r.provider} · {r.servicelevel.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/50">
                      {r.estimated_days
                        ? `~${r.estimated_days} day${r.estimated_days === 1 ? "" : "s"}`
                        : r.duration_terms ?? "Transit time varies"}
                      {r.attributes && r.attributes.length
                        ? ` · ${r.attributes.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gold-200">
                      {Number(r.amount).toFixed(2)} {r.currency}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onBuyLabel(r)}
                      className="rounded-sm bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-40"
                    >
                      {busy ? "Buying…" : "Buy label"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {buyError ? (
            <p className="text-xs text-red-300/90">{buyError}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ExistingLabel(props: {
  labelUrl: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingStatus: string | null;
  service: string | null;
}) {
  return (
    <div className="space-y-2 rounded-sm border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={props.labelUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-black hover:bg-gold-200"
        >
          Download label PDF ↗
        </a>
        {props.trackingUrl ? (
          <a
            href={props.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gold-300 underline decoration-dotted hover:text-gold-200"
          >
            Track shipment ↗
          </a>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-y-1 text-xs sm:grid-cols-2">
        {props.trackingNumber ? (
          <Row label="Tracking" value={<span className="font-mono">{props.trackingNumber}</span>} />
        ) : null}
        {props.service ? <Row label="Service" value={props.service} /> : null}
        {props.trackingStatus ? (
          <Row label="Status" value={props.trackingStatus} />
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        {label}
      </dt>
      <dd className="text-white/85">{value}</dd>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50 ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
      {label}
      {children}
    </label>
  );
}

function Input(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-gold-500/40"
    />
  );
}

/** Best-effort parser for the single-line shipping_address text we collect today. */
function parseShippingAddress(
  raw: string | null,
  fallbackName: string | null
): Address {
  const empty: Address = {
    name: fallbackName ?? "",
    street1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  };
  if (!raw) return empty;
  const lines = raw
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Heuristic: last line often `City, ST 12345` or `City, ST 12345, US`
  let city = "";
  let state = "";
  let zip = "";
  let country = "US";
  let consumedTail = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(
      /^([^,]+?),\s*([A-Z]{2})\s+(\d{4,10})(?:\s*,?\s*([A-Z]{2,3}))?$/i
    );
    if (m) {
      city = m[1].trim();
      state = m[2].toUpperCase();
      zip = m[3];
      country = (m[4] ?? "US").toUpperCase();
      consumedTail = lines.length - i;
      break;
    }
  }

  const head = lines.slice(0, lines.length - Math.max(consumedTail, 1));
  // First line is name if there's no other obvious name source.
  const name = fallbackName ?? head[0] ?? "";
  const streetStart = fallbackName ? 0 : 1;
  const streetLines = head.slice(streetStart);
  const street1 = streetLines[0] ?? "";
  const street2 = streetLines.slice(1).join(", ");

  return {
    name,
    street1,
    street2: street2 || undefined,
    city,
    state,
    zip,
    country,
  };
}
