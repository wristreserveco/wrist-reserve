"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";

/** Row shape returned from /api/admin/reviews (review + product join). */
interface AdminReviewRow {
  id: string;
  product_id: string;
  reviewer_name: string;
  email: string | null;
  rating: number;
  body: string;
  approved: boolean;
  created_at: string;
  photos?: string[] | null;
  product?: { name: string | null; brand: string | null } | null;
}

/**
 * Group rows by product so the moderation grid is organized "by piece".
 * Sorts the groups so:
 *   1. The product with the most reviews shows first
 *   2. Ties break by most recent activity
 */
function groupByProduct(rows: AdminReviewRow[]): {
  productId: string;
  productName: string;
  productBrand: string | null;
  reviews: AdminReviewRow[];
}[] {
  const map = new Map<string, AdminReviewRow[]>();
  for (const r of rows) {
    const list = map.get(r.product_id) ?? [];
    list.push(r);
    map.set(r.product_id, list);
  }
  const groups = Array.from(map.entries()).map(([productId, reviews]) => {
    const head = reviews[0];
    return {
      productId,
      productName: head.product?.name || "Unknown product",
      productBrand: head.product?.brand || null,
      reviews,
    };
  });
  groups.sort((a, b) => {
    if (b.reviews.length !== a.reviews.length) {
      return b.reviews.length - a.reviews.length;
    }
    const am = new Date(a.reviews[0].created_at).getTime();
    const bm = new Date(b.reviews[0].created_at).getTime();
    return bm - am;
  });
  return groups;
}

interface Props {
  initialReviews: AdminReviewRow[];
  initialWarning?: string;
}

export function AdminReviewsManager({
  initialReviews,
  initialWarning,
}: Props) {
  const [reviews, setReviews] = useState<AdminReviewRow[]>(initialReviews);
  const [warning, setWarning] = useState<string | null>(initialWarning ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Background refresh after edit / delete so optimistic state stays
  // honest if a second admin tab also moderates.
  async function refresh() {
    try {
      const res = await fetch("/api/admin/reviews", { credentials: "include" });
      const data = (await res.json()) as {
        reviews?: AdminReviewRow[];
        warning?: string;
      };
      if (Array.isArray(data.reviews)) setReviews(data.reviews);
      if (data.warning) setWarning(data.warning);
    } catch {
      /* keep current state */
    }
  }

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const filtered = term
      ? reviews.filter((r) => {
          return (
            r.reviewer_name.toLowerCase().includes(term) ||
            r.body.toLowerCase().includes(term) ||
            (r.product?.name ?? "").toLowerCase().includes(term) ||
            (r.product?.brand ?? "").toLowerCase().includes(term)
          );
        })
      : reviews;
    return groupByProduct(filtered);
  }, [reviews, filter]);

  async function handleSave(id: string, patch: Partial<AdminReviewRow>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        review?: AdminReviewRow;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Save failed");
      }
      // Patch the row in-place so we don't lose the joined product object.
      setReviews((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, ...(data.review ?? {}), product: r.product }
            : r
        )
      );
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this review? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Delete failed");
      }
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Reviews</h1>
          <p className="mt-1 text-sm text-white/55">
            Edit, approve, hide or delete any review across the catalog.
            Backdate or attach photos to make seeded reviews feel organic.
          </p>
        </div>
        <input
          type="search"
          placeholder="Filter by product, reviewer, or text…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-sm border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40 sm:w-80"
        />
      </header>

      {warning ? (
        <p className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {warning}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-sm border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-white/55">
            {filter
              ? "No reviews match that filter."
              : "No reviews yet. Buyers can leave one from any product page; or compose your own from there to seed."}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.productId}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  {g.productBrand ? (
                    <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                      {g.productBrand}
                    </p>
                  ) : null}
                  <h2 className="font-display text-xl text-white">
                    {g.productName}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/45">
                  <span>
                    {g.reviews.length} review
                    {g.reviews.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href={`/products/${g.productId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-300 underline-offset-4 hover:underline"
                  >
                    View on site ↗
                  </Link>
                </div>
              </div>
              <div className="grid gap-4">
                {g.reviews.map((r) => (
                  <ReviewRow
                    key={r.id}
                    row={r}
                    isEditing={editingId === r.id}
                    onStartEdit={() => setEditingId(r.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={(patch) => handleSave(r.id, patch)}
                    onDelete={() => handleDelete(r.id)}
                    saving={savingId === r.id}
                    deleting={deletingId === r.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="pt-4 text-xs text-white/30">
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-sm border border-white/10 px-3 py-1.5 text-white/55 transition hover:border-white/30 hover:text-white"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  row: AdminReviewRow;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<AdminReviewRow>) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}

function ReviewRow({
  row,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  saving,
  deleting,
}: RowProps) {
  const [name, setName] = useState(row.reviewer_name);
  const [rating, setRating] = useState(row.rating);
  const [body, setBody] = useState(row.body);
  const [date, setDate] = useState(toDateInput(row.created_at));
  const [approved, setApproved] = useState(row.approved);
  const [photos, setPhotos] = useState<string[]>(row.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When the row resets (e.g. after a save), re-seed the local form state.
  useEffect(() => {
    if (!isEditing) {
      setName(row.reviewer_name);
      setRating(row.rating);
      setBody(row.body);
      setDate(toDateInput(row.created_at));
      setApproved(row.approved);
      setPhotos(row.photos ?? []);
    }
  }, [
    isEditing,
    row.reviewer_name,
    row.rating,
    row.body,
    row.created_at,
    row.approved,
    row.photos,
  ]);

  async function handlePickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadOne(file);
        if (url) uploaded.push(url);
      }
      setPhotos((prev) => [...prev, ...uploaded].slice(0, 12));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
  }

  function save() {
    const patch: Partial<AdminReviewRow> = {
      reviewer_name: name,
      rating,
      body,
      approved,
      photos,
    };
    if (date) {
      // Convert the YYYY-MM-DD picker value into a noon-UTC ISO so it
      // shows up the same calendar day in every timezone.
      patch.created_at = new Date(`${date}T12:00:00Z`).toISOString();
    }
    onSave(patch);
  }

  return (
    <article
      className={`rounded-sm border bg-white/[0.02] p-4 transition ${
        approved
          ? "border-white/10"
          : "border-amber-400/30 bg-amber-400/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-gold-300">{renderStars(row.rating)}</span>
          <span className="text-sm text-white">{row.reviewer_name}</span>
          {row.email ? (
            <span className="text-xs text-white/35">{row.email}</span>
          ) : null}
          {!row.approved ? (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-amber-200">
              Hidden
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/35">
            {formatDate(row.created_at)}
          </span>
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded-sm border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65 transition hover:border-gold-400/40 hover:text-gold-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-sm border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55 transition hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!isEditing ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            &ldquo;{row.body}&rdquo;
          </p>
          {row.photos && row.photos.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.photos.map((src) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-14 w-14 overflow-hidden rounded-sm border border-white/10 transition hover:border-gold-400/50"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={LUXE_BLUR_DATA_URL}
                    unoptimized={shouldUnoptimize(src)}
                  />
                </a>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-white/45">
                Reviewer name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-white/45">
                Rating
              </span>
              <div className="flex h-[38px] items-center gap-1 rounded-sm border border-white/10 bg-black px-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} stars`}
                    className={`text-lg transition ${
                      n <= rating
                        ? "text-gold-300"
                        : "text-white/20 hover:text-white/50"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-white/45">
                Posted on
              </span>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-white/45">
              Body
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            />
          </label>

          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/45">
              Photos ({photos.length}/12)
            </p>
            <div className="flex flex-wrap gap-2">
              {photos.map((src) => (
                <div
                  key={src}
                  className="group relative h-16 w-16 overflow-hidden rounded-sm border border-white/10"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={LUXE_BLUR_DATA_URL}
                    unoptimized={shouldUnoptimize(src)}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(src)}
                    aria-label="Remove photo"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white/80 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 12 ? (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-sm border border-dashed border-white/15 text-xs text-white/40 transition hover:border-gold-400/40 hover:text-gold-200">
                  {uploading ? "…" : "+"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handlePickPhotos(e.target.files)}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <label className="inline-flex items-center gap-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                className="accent-gold-400"
              />
              Visible on the storefront
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={saving}
                className="rounded-sm px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/55 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || uploading}
                className="rounded-sm bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Direct-to-Supabase upload using a one-shot signed URL — same pattern as
 * MediaUploader / SingleImagePicker. Returns the public URL on success.
 */
async function uploadOne(file: File): Promise<string | null> {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const contentType = file.type || "image/jpeg";

  const ticketRes = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      kind: "image",
      filename: cleanName,
      contentType,
    }),
  });
  const ticket = (await ticketRes.json().catch(() => ({}))) as {
    signedUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!ticketRes.ok || !ticket.signedUrl || !ticket.publicUrl) {
    throw new Error(
      ticket.error || `Upload prep failed (HTTP ${ticketRes.status})`
    );
  }

  const putRes = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Storage upload failed (HTTP ${putRes.status})`);
  }
  return ticket.publicUrl;
}

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return (
    "★".repeat(Math.min(5, Math.max(0, full))) +
    "☆".repeat(5 - Math.min(5, Math.max(0, full)))
  );
}

function toDateInput(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
