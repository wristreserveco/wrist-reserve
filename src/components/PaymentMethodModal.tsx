"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/products";
import type { ManualMethod } from "@/lib/payments/manual";
import { PaymentQR } from "@/components/payments/PaymentQR";

type Rail = "crypto" | "stripe" | ManualMethod;

interface PaymentMethodModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  availableRails: ("crypto" | "stripe" | "manual")[];
  manualMethods: ManualMethod[];
}

interface ManualInstructions {
  orderId: string;
  method: ManualMethod;
  methodLabel: string;
  handle: string;
  amount: number;
  amountDisplay: string;
  memo: string;
  deepLink: string | null;
  qrImageUrl: string | null;
  productName?: string | null;
}

const RAIL_COPY: Record<
  Rail,
  { title: string; subtitle: string; tag?: string }
> = {
  crypto: {
    title: "Pay with Crypto",
    subtitle: "USDT, BTC, ETH + 60 more · instant · no chargebacks",
    tag: "Fastest",
  },
  cashapp: {
    title: "Pay with Cash App",
    subtitle: "Send to our $cashtag · ships within 2h of payment",
  },
  zelle: {
    title: "Pay with Zelle",
    subtitle: "Send from any US bank app · ships within 2h",
  },
  applecash: {
    title: "Pay with Apple Cash",
    subtitle: "Send from Messages · ships within 2h",
  },
  wire: {
    title: "Pay with Wire Transfer",
    subtitle: "Best for $5k+ · ships once funds clear",
  },
  stripe: {
    title: "Pay with Card or Apple Pay",
    subtitle: "Visa · Mastercard · Amex · Apple Pay · Google Pay",
  },
  square: {
    title: "Pay with Card (Square)",
    subtitle: "Visa · Mastercard · Amex · ships once receipt is verified",
  },
};

export function PaymentMethodModal({
  open,
  onClose,
  product,
  availableRails,
  manualMethods,
}: PaymentMethodModalProps) {
  const [step, setStep] = useState<"select" | "instructions" | "loading" | "done">(
    "select"
  );
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<ManualInstructions | null>(null);

  useEffect(() => {
    if (open) {
      setStep("select");
      setError(null);
      setInstructions(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Flatten rails: split "manual" into one tile per configured method.
  const flatRails: Rail[] = [];
  for (const r of availableRails) {
    if (r === "manual") {
      manualMethods.forEach((m) => flatRails.push(m));
    } else {
      flatRails.push(r);
    }
  }

  async function startCrypto() {
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/checkout/crypto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await res.json()) as { invoiceUrl?: string; error?: string };
      if (!res.ok || !data.invoiceUrl) {
        throw new Error(data.error || "Crypto checkout failed");
      }
      window.location.href = data.invoiceUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crypto checkout failed");
      setStep("select");
    }
  }

  async function startStripe() {
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Card checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card checkout failed");
      setStep("select");
    }
  }

  async function startManual(method: ManualMethod) {
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/checkout/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, method }),
      });
      const data = (await res.json()) as
        | (ManualInstructions & { error?: undefined })
        | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Checkout failed");
      }
      setInstructions(data as ManualInstructions);
      setStep("instructions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setStep("select");
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-zinc-950 p-6 shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.6)] sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                  Checkout
                </p>
                <h2 className="mt-1 truncate font-display text-2xl text-white">
                  {product.name}
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {formatPrice(product.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/30 hover:text-white"
              >
                Close
              </button>
            </div>

            {error ? (
              <p className="mt-5 rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {error}
              </p>
            ) : null}

            {step === "select" ? (
              <div className="mt-7 space-y-3">
                {flatRails.map((rail) => {
                  const copy = RAIL_COPY[rail];
                  const featured = rail === "crypto";
                  return (
                    <button
                      key={rail}
                      type="button"
                      onClick={() => {
                        if (rail === "crypto") void startCrypto();
                        else if (rail === "stripe") void startStripe();
                        else void startManual(rail);
                      }}
                      className={`group flex w-full items-center justify-between gap-4 rounded-sm border px-5 py-4 text-left transition ${
                        featured
                          ? "border-gold-400/40 bg-gold-400/5 hover:border-gold-300/70 hover:bg-gold-400/10"
                          : "border-white/10 hover:border-white/30 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {copy.title}
                          </span>
                          {copy.tag ? (
                            <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-gold-200">
                              {copy.tag}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-white/50">{copy.subtitle}</p>
                      </div>
                      <span className="text-white/30 transition group-hover:translate-x-1 group-hover:text-white/70">
                        →
                      </span>
                    </button>
                  );
                })}
                {flatRails.length === 0 ? (
                  <p className="rounded-sm border border-white/10 px-4 py-3 text-xs text-white/50">
                    No payment methods configured yet.
                  </p>
                ) : null}
                <p className="pt-3 text-center text-[10px] uppercase tracking-[0.22em] text-white/30">
                  Discreet · Insured · Ships worldwide
                </p>
              </div>
            ) : null}

            {step === "instructions" && instructions ? (
              <ManualInstructionsView
                data={instructions}
                onBack={() => setStep("select")}
                onDone={() => setStep("done")}
              />
            ) : null}

            {step === "done" && instructions ? (
              <DonePanel instructions={instructions} />
            ) : null}

            {step === "loading" ? (
              <div className="mt-10 flex flex-col items-center gap-3 py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                  Preparing checkout…
                </p>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ManualInstructionsView({
  data,
  onBack,
  onDone,
}: {
  data: ManualInstructions;
  onBack: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !address.trim()) {
      setError("Name, email, and shipping address are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/manual/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: data.orderId,
          name,
          email,
          phone,
          address,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to confirm");
      }
      onDone();
      setTimeout(() => {
        window.location.href = `/checkout/pending/${data.orderId}`;
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
      setSubmitting(false);
    }
  }

  const showQr = data.method === "cashapp" || data.method === "zelle";
  const qrValue =
    data.method === "cashapp"
      ? data.deepLink ?? `https://cash.app/$${data.handle.replace(/^\$/, "")}`
      : null;
  const isSquare = data.method === "square";

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-sm border border-gold-500/25 bg-gold-500/[0.04] p-5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-300">
          {isSquare
            ? `Pay ${data.amountDisplay} with card`
            : `Send ${data.amountDisplay} via ${data.methodLabel}`}
        </p>

        {isSquare ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-white/75">
              You&rsquo;ll be taken to our secure Square Checkout in a new tab to pay
              with any credit or debit card. Come back here after paying to upload
              your receipt — we&rsquo;ll ship the moment it&rsquo;s verified.
            </p>
            {data.deepLink ? (
              <a
                href={data.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200"
              >
                Pay {data.amountDisplay} with card via Square →
              </a>
            ) : null}
            <div className="space-y-2 rounded-sm border border-white/10 bg-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                If Square asks for a note / description
              </p>
              <p className="font-mono text-sm text-white">
                {data.memo}
                {data.productName ? ` · ${data.productName}` : ""}
              </p>
              <p className="text-[10px] text-white/45">
                This helps us match your payment instantly. Copy it if Square lets you
                add a note.
              </p>
            </div>
          </div>
        ) : showQr ? (
          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <PaymentQR
              value={qrValue}
              imageUrl={data.qrImageUrl}
              caption={
                data.method === "cashapp"
                  ? "Scan with phone camera"
                  : "Scan with your bank app"
              }
              size={170}
            />
            <div className="flex-1 space-y-3 text-left">
              <InstructionRow label={data.methodLabel} value={data.handle} />
              <InstructionRow label="Amount" value={data.amountDisplay} />
              <InstructionRow
                label="Memo / Note"
                value={data.memo}
                hint="Paste into the payment note — it's how we match your order."
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <InstructionRow label={data.methodLabel} value={data.handle} />
            <InstructionRow label="Amount" value={data.amountDisplay} />
            <InstructionRow
              label="Memo / Note"
              value={data.memo}
              hint="Paste into the payment note — it's how we match your order."
            />
          </div>
        )}

        {data.deepLink && data.method === "cashapp" ? (
          <a
            href={data.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200"
          >
            Open Cash App →
          </a>
        ) : null}
        {data.method === "zelle" ? (
          <p className="mt-5 text-[11px] leading-relaxed text-white/55">
            Open your bank app → <span className="text-white">Zelle</span> → Send to{" "}
            <span className="text-white">{data.handle}</span> →{" "}
            <span className="text-white">{data.amountDisplay}</span> → paste{" "}
            <span className="text-white">{data.memo}</span> into the memo.
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">
          Ship my watch to
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
          />
          <input
            type="email"
            placeholder="Email for receipt"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
          />
        </div>
        <textarea
          placeholder="Full shipping address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className="w-full rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
        />
        <input
          type="tel"
          placeholder="Phone (optional — for courier)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
        />

        {error ? (
          <p className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="rounded-sm border border-white/10 px-5 py-3 text-xs uppercase tracking-[0.2em] text-white/60 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:opacity-40"
          >
            {submitting ? "Confirming…" : "I've sent payment · Ship it"}
          </button>
        </div>
        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-white/35">
          Ships within 2h of verification · Tracked + insured
        </p>
      </form>
    </div>
  );
}

function InstructionRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // noop
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-white/10 bg-black/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">
            {label}
          </p>
          <p className="mt-1 truncate font-mono text-sm text-white">{value}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className={`shrink-0 rounded-sm border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
            copied
              ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
              : "border-white/15 text-white/55 hover:border-white/40 hover:text-white"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {hint ? (
        <p className="mt-1 text-[10px] leading-relaxed text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

function DonePanel({ instructions }: { instructions: ManualInstructions }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
        ✓
      </div>
      <div>
        <p className="font-display text-2xl text-white">Confirmed</p>
        <p className="mt-2 text-sm text-white/55">
          Watching {instructions.methodLabel} for memo{" "}
          <span className="font-mono text-white">{instructions.memo}</span>.
          Taking you to order tracking…
        </p>
      </div>
    </div>
  );
}
