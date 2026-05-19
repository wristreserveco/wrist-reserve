"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Structured shipping address shape — matches Shippo's `address` payload
 * so we can hand it straight to the validation endpoint and persist the
 * normalized version on the order.
 */
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

interface Props {
  /** Called whenever the verified shipping address changes. The form fires
   *  `null` when the buyer edits a verified address (which invalidates it)
   *  and a full address object when verification (or explicit "keep what
   *  I entered") succeeds. The parent uses this to gate payment buttons. */
  onVerifiedChange: (address: ShippingAddress | null) => void;
  /** Initial values (e.g. when the buyer comes back to edit the form). */
  initial?: Partial<ShippingAddress>;
  /** Disable inputs while the parent is doing something else
   *  (e.g. a PayPal capture is in-flight). */
  disabled?: boolean;
}

const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const FIELD = `w-full rounded-sm border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold-400/60 focus:ring-1 focus:ring-gold-400/30`;
const LABEL = `block text-[10px] uppercase tracking-[0.22em] text-white/45`;

const STORAGE_KEY = "wr_ship_to";

export function ShippingAddressForm({
  onVerifiedChange,
  initial,
  disabled,
}: Props) {
  // Hydrate from localStorage on first render — saves repeat buyers from
  // re-typing the same address on every checkout.
  const seed: ShippingAddress = useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ShippingAddress>;
          return {
            name: parsed.name ?? initial?.name ?? "",
            street1: parsed.street1 ?? initial?.street1 ?? "",
            street2: parsed.street2 ?? initial?.street2 ?? "",
            city: parsed.city ?? initial?.city ?? "",
            state: parsed.state ?? initial?.state ?? "",
            zip: parsed.zip ?? initial?.zip ?? "",
            country: parsed.country ?? initial?.country ?? "US",
            phone: parsed.phone ?? initial?.phone ?? "",
            email: parsed.email ?? initial?.email ?? "",
          };
        }
      } catch {
        /* noop */
      }
    }
    return {
      name: initial?.name ?? "",
      street1: initial?.street1 ?? "",
      street2: initial?.street2 ?? "",
      city: initial?.city ?? "",
      state: initial?.state ?? "",
      zip: initial?.zip ?? "",
      country: initial?.country ?? "US",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [v, setV] = useState<ShippingAddress>(seed);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ShippingAddress | null>(null);
  /** When non-null, the form considers this address "ready to ship" — the
   *  buyer has either passed USPS validation or explicitly kept their
   *  original input. Mutating any field below invalidates it. */
  const [verifiedAddress, setVerifiedAddress] = useState<ShippingAddress | null>(
    null
  );

  // ─── Autocomplete state ──────────────────────────────────────────────
  // As the buyer types in the street field we hit our /api/checkout/
  // address-suggest proxy (Photon-backed) and surface up to 5 matches.
  // Picking one fills street1/city/state/zip in a single tap, then we
  // auto-run USPS verification so payment unlocks instantly.
  interface AddressSuggestion {
    label: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  }
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const suggestRequestRef = useRef(0);
  const pickedRef = useRef(false);

  function update<K extends keyof ShippingAddress>(key: K, value: string) {
    setV((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setWarning(null);
    setProposed(null);
    // Any edit invalidates the prior verified state.
    if (verifiedAddress) {
      setVerifiedAddress(null);
      onVerifiedChange(null);
    }
  }

  function commitVerified(addr: ShippingAddress) {
    persistLocal(addr);
    setVerifiedAddress(addr);
    setProposed(null);
    setWarning(null);
    setError(null);
    onVerifiedChange(addr);
  }

  // Fetch + verify helpers ────────────────────────────────────────────
  // Kept as plain functions (not callbacks/effects) so the dependency
  // graph stays simple and we can call them imperatively from the
  // autocomplete dropdown.
  async function runVerify(addr: ShippingAddress): Promise<void> {
    setVerifying(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/checkout/verify-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addr),
      });
      const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean | null;
        message?: string | null;
        normalized?: ShippingAddress;
      };
      if (data.valid === true && data.normalized) {
        const norm: ShippingAddress = { ...addr, ...data.normalized };
        const differs =
          norm.street1.trim().toLowerCase() !==
            addr.street1.trim().toLowerCase() ||
          norm.city.trim().toLowerCase() !==
            addr.city.trim().toLowerCase() ||
          norm.zip.trim() !== addr.zip.trim();
        if (differs) {
          setProposed(norm);
          setWarning(
            "USPS suggested a small correction. Accept it for the fewest delivery issues."
          );
        } else {
          commitVerified(norm);
        }
      } else if (data.valid === false) {
        setError(
          data.message ||
            "USPS couldn't verify that address. Double-check spelling, street number, and ZIP."
        );
      } else {
        // valid === null → verifier offline. Trust input.
        commitVerified(addr);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Verification failed";
      setError(`Couldn't verify the address (${msg}). Please try again.`);
    } finally {
      setVerifying(false);
    }
  }

  // Debounced suggestion fetch — uses street + city + state + ZIP together
  // so Photon can disambiguate (e.g. "Main St" + "Houston" + "TX").
  useEffect(() => {
    // Skip lookups while the form is locked in a verified state, while
    // we're already mid-verify, or right after a pick (the pick handler
    // does its own state cleanup).
    if (pickedRef.current) {
      pickedRef.current = false;
      return;
    }
    if (verifiedAddress) return;
    if (verifying) return;

    const combined = [v.street1, v.city, v.state, v.zip]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (combined.length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const id = ++suggestRequestRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/checkout/address-suggest?q=${encodeURIComponent(combined)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: AddressSuggestion[] };
        // Race-condition guard: drop the response if another fetch has
        // already kicked off after this one.
        if (id !== suggestRequestRef.current) return;
        const list = data.suggestions ?? [];
        setSuggestions(list);
        setSuggestionsOpen(list.length > 0);
        setActiveIdx(-1);
      } catch {
        /* silent — autocomplete is a nice-to-have, never blocking */
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [v.street1, v.city, v.state, v.zip, verifiedAddress, verifying]);

  function applySuggestion(s: AddressSuggestion) {
    pickedRef.current = true;
    const merged: ShippingAddress = {
      ...v,
      street1: s.street1,
      city: s.city,
      state: s.state || v.state,
      zip: s.zip || v.zip,
      country: s.country || v.country || "US",
    };
    setV(merged);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveIdx(-1);
    // Auto-run USPS verification if we've got everything needed; this is
    // what makes the form feel "magic" — pick a result, payment unlocks.
    const enoughForVerify =
      merged.name.trim() &&
      merged.street1.trim() &&
      merged.city.trim() &&
      merged.state.trim() &&
      merged.zip.trim() &&
      (merged.email?.trim() ?? "");
    if (enoughForVerify) {
      void runVerify(merged);
    }
  }

  function onSuggestionsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < suggestions.length) {
        e.preventDefault();
        applySuggestion(suggestions[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setSuggestionsOpen(false);
    }
  }

  function persistLocal(addr: ShippingAddress) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(addr));
    } catch {
      /* noop */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !v.name.trim() ||
      !v.street1.trim() ||
      !v.city.trim() ||
      !v.state.trim() ||
      !v.zip.trim() ||
      !v.email?.trim()
    ) {
      setError(
        "Please fill in name, street, city, state, ZIP, and an email we can reach you at."
      );
      return;
    }
    await runVerify(v);
  }

  function acceptProposed() {
    if (!proposed) return;
    setV(proposed);
    commitVerified(proposed);
  }
  function keepOriginal() {
    if (!proposed) return;
    commitVerified(v);
  }

  useEffect(() => {
    setError(null);
  }, [v]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={LABEL} htmlFor="ship-name">
          Full name
        </label>
        <input
          id="ship-name"
          className={`${FIELD} mt-1.5`}
          value={v.name}
          onChange={(e) => update("name", e.target.value)}
          autoComplete="name"
          required
          disabled={disabled || verifying}
        />
      </div>

      <div className="relative">
        <label className={LABEL} htmlFor="ship-street1">
          Street address
        </label>
        <input
          id="ship-street1"
          className={`${FIELD} mt-1.5`}
          value={v.street1}
          placeholder="Start typing — we'll suggest matches"
          onChange={(e) => update("street1", e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setSuggestionsOpen(true);
          }}
          onBlur={() => {
            // Defer so a click on a suggestion fires first.
            window.setTimeout(() => setSuggestionsOpen(false), 120);
          }}
          onKeyDown={onSuggestionsKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen}
          aria-controls="ship-street1-suggestions"
          role="combobox"
          required
          disabled={disabled || verifying}
        />
        {suggestionsOpen && suggestions.length > 0 ? (
          <ul
            id="ship-street1-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-sm border border-white/15 bg-zinc-950 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]"
          >
            {suggestions.map((s, i) => (
              <li key={`${s.label}-${i}`} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent the input's onBlur from firing before we
                    // process the click.
                    e.preventDefault();
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => applySuggestion(s)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-white/5 px-3 py-2.5 text-left text-sm transition last:border-b-0 ${
                    i === activeIdx
                      ? "bg-gold-400/10 text-white"
                      : "text-white/85 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="font-medium leading-tight">{s.street1}</span>
                  <span className="text-[11px] text-white/55">
                    {s.city}
                    {s.state ? `, ${s.state}` : ""}
                    {s.zip ? ` ${s.zip}` : ""}
                  </span>
                </button>
              </li>
            ))}
            <li className="border-t border-white/5 px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] text-white/30">
              ↑↓ to navigate · Enter to pick
            </li>
          </ul>
        ) : null}
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/38">
          Add city and state if suggestions look wrong. Every address is checked
          against USPS (via Shippo) when you tap Verify—autocomplete is just a
          typing shortcut, not the final word.
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="ship-street2">
          Apt / Suite / Unit <span className="text-white/25">(optional)</span>
        </label>
        <input
          id="ship-street2"
          className={`${FIELD} mt-1.5`}
          value={v.street2}
          placeholder="Apt 4B"
          onChange={(e) => update("street2", e.target.value)}
          autoComplete="address-line2"
          disabled={disabled || verifying}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_120px_110px]">
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL} htmlFor="ship-city">
            City
          </label>
          <input
            id="ship-city"
            className={`${FIELD} mt-1.5`}
            value={v.city}
            onChange={(e) => update("city", e.target.value)}
            autoComplete="address-level2"
            required
            disabled={disabled || verifying}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="ship-state">
            State
          </label>
          <select
            id="ship-state"
            className={`${FIELD} mt-1.5`}
            value={v.state}
            onChange={(e) => update("state", e.target.value)}
            autoComplete="address-level1"
            required
            disabled={disabled || verifying}
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ship-zip">
            ZIP
          </label>
          <input
            id="ship-zip"
            className={`${FIELD} mt-1.5`}
            value={v.zip}
            onChange={(e) => update("zip", e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            required
            disabled={disabled || verifying}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="ship-email">
            Email
          </label>
          <input
            id="ship-email"
            type="email"
            className={`${FIELD} mt-1.5`}
            value={v.email}
            onChange={(e) => update("email", e.target.value)}
            autoComplete="email"
            required
            disabled={disabled || verifying}
          />
          <p className="mt-1 text-[10px] text-white/35">
            We&rsquo;ll send your tracking + order confirmation here.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="ship-phone">
            Phone <span className="text-white/25">(optional)</span>
          </label>
          <input
            id="ship-phone"
            type="tel"
            className={`${FIELD} mt-1.5`}
            value={v.phone}
            onChange={(e) => update("phone", e.target.value)}
            autoComplete="tel"
            disabled={disabled || verifying}
          />
          <p className="mt-1 text-[10px] text-white/35">
            Add it and we&rsquo;ll text you the tracking too.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-sm border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      {warning && proposed ? (
        <div className="rounded-sm border border-gold-400/30 bg-gold-400/5 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/80">
            Suggested address
          </p>
          <p className="mt-1.5 text-sm text-white">{proposed.street1}</p>
          {proposed.street2 ? (
            <p className="text-sm text-white">{proposed.street2}</p>
          ) : null}
          <p className="text-sm text-white">
            {proposed.city}, {proposed.state} {proposed.zip}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={acceptProposed}
              className="flex-1 rounded-sm bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200"
            >
              Use suggested
            </button>
            <button
              type="button"
              onClick={keepOriginal}
              className="flex-1 rounded-sm border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/75 transition hover:border-white hover:text-white"
            >
              Keep what I entered
            </button>
          </div>
        </div>
      ) : null}

      {/* Once an address is verified, show a compact confirmation pill in
       *  place of the verify button. Editing any field above will unset
       *  this and the verify button will reappear. */}
      {verifiedAddress ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-emerald-400/30 bg-emerald-400/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">
              ✓ USPS verified
            </p>
            <p className="mt-0.5 truncate text-xs text-white/65">
              Ship to {verifiedAddress.city}, {verifiedAddress.state}{" "}
              {verifiedAddress.zip}
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">
            Edit above to change
          </span>
        </div>
      ) : !proposed ? (
        <button
          type="submit"
          disabled={disabled || verifying}
          className="w-full rounded-sm bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifying ? "Verifying with USPS…" : "Verify address with USPS"}
        </button>
      ) : null}
    </form>
  );
}
