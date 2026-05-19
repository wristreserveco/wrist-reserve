"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ProductReview } from "@/lib/types";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

interface Props {
  productId: string;
  initialReviews: ProductReview[];
}

/**
 * Public review section for a product.
 *
 * - Reviews load server-side (passed via `initialReviews`) for fast paint.
 * - Anyone can leave a review through the inline form — auto-approved.
 * - Admin moderation (edit / delete / photo attach / backdate) lives at
 *   `/admin/reviews`. We keep this component fully buyer-facing so there
 *   are no admin chrome leaks on the public site.
 * - Honeypot field + lightweight validation keeps the bot floor down.
 */
export function ProductReviews({ productId, initialReviews }: Props) {
  const router = useRouter();
  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const count = reviews.length;
  const avg =
    count > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Your name is required.");
      return;
    }
    if (body.trim().length < 5) {
      setError("Add a bit more to your review.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_name: name,
          email: email || undefined,
          rating,
          body,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        review?: ProductReview;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not post review");
      }
      if (data.review) {
        setReviews((prev) => [data.review as ProductReview, ...prev]);
      }
      setName("");
      setEmail("");
      setRating(5);
      setBody("");
      setSuccess(true);
      setFormOpen(false);
      setTimeout(() => setSuccess(false), 3500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-20 border-t border-white/10 pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-400/90">
            Reviews
          </p>
          <h2 className="mt-2 font-display text-2xl text-white">
            What collectors are saying
          </h2>
          {count > 0 ? (
            <p className="mt-2 text-sm text-white/50">
              <span className="text-gold-200">{renderStars(avg)}</span>
              <span className="ml-2">
                {avg.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/45">
              Be the first to review this piece.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className="self-start rounded-sm border border-white/20 px-5 py-2.5 text-xs uppercase tracking-[0.22em] text-white transition hover:border-gold-500/50 hover:text-gold-100 sm:self-end"
        >
          {formOpen ? "Cancel" : "Leave a review"}
        </button>
      </div>

      {success ? (
        <p className="mt-6 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Thanks — your review is live.
        </p>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={submit}
          className="mt-8 space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/45">
              Your rating
            </span>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            />
          </div>
          <textarea
            placeholder="Tell other collectors what you think…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
          />
          {/* Honeypot — real users leave it blank; bots tend to fill every field. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute left-[-9999px] h-px w-px opacity-0"
            aria-hidden="true"
          />
          {error ? (
            <p className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-sm bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-200 disabled:opacity-40"
            >
              {submitting ? "Posting…" : "Post review"}
            </button>
          </div>
        </form>
      ) : null}

      {count > 0 ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {reviews.map((r) => (
            <blockquote
              key={r.id}
              className="rounded-sm border border-white/5 bg-white/[0.02] p-6 transition hover:border-gold-500/20"
            >
              <div className="text-gold-300">{renderStars(r.rating)}</div>
              <p className="mt-3 text-sm leading-relaxed text-white/80">
                &ldquo;{r.body}&rdquo;
              </p>
              {r.photos && r.photos.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.photos.slice(0, 6).map((src) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-16 w-16 overflow-hidden rounded-sm border border-white/10 transition hover:border-gold-400/60"
                    >
                      <Image
                        src={src}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                        placeholder="blur"
                        blurDataURL={LUXE_BLUR_DATA_URL}
                        unoptimized={shouldUnoptimize(src)}
                      />
                    </a>
                  ))}
                </div>
              ) : null}
              <footer className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40">
                {r.reviewer_name}
                <span className="mx-2 text-white/20">·</span>
                {formatDate(r.created_at)}
              </footer>
            </blockquote>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          className={`text-xl transition ${
            n <= value ? "text-gold-300" : "text-white/20 hover:text-white/50"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return (
    "★".repeat(Math.min(5, Math.max(0, full))) +
    "☆".repeat(5 - Math.min(5, Math.max(0, full)))
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
