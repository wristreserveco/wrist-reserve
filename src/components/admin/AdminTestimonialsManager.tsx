"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LUXE_BLUR_DATA_URL, shouldUnoptimize } from "@/lib/image-placeholder";
import type { Testimonial } from "@/lib/types";

const SOURCE_PRESETS = [
  "Instagram",
  "iMessage",
  "WhatsApp",
  "Facebook",
  "Email",
  "TikTok",
  "X (Twitter)",
  "Other",
];

interface Props {
  initialTestimonials: Testimonial[];
  initialWarning?: string;
  productOptions: { id: string; label: string }[];
}

/**
 * Admin manager for the "Word of Mouth" wall.
 *
 * Workflow:
 *   1. Drop one or many screenshots into the dashed dropzone — each is
 *      uploaded to Supabase Storage via /api/admin/upload-url, then a row
 *      is inserted via POST /api/admin/testimonials.
 *   2. Each card in the grid below is inline-editable: source, customer
 *      name, caption, posted date, linked product, visibility, sort order.
 *   3. Delete is one-click with a confirm.
 */
export function AdminTestimonialsManager({
  initialTestimonials,
  initialWarning,
  productOptions,
}: Props) {
  const [items, setItems] = useState<Testimonial[]>(initialTestimonials);
  const [warning] = useState<string | null>(initialWarning ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<
    { name: string; status: "uploading" | "done" | "error"; error?: string }[]
  >([]);
  const [filter, setFilter] = useState("");
  const [defaultSource, setDefaultSource] = useState("Instagram");
  const dropRef = useRef<HTMLLabelElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (t) =>
        (t.source || "").toLowerCase().includes(term) ||
        (t.customer_name || "").toLowerCase().includes(term) ||
        (t.caption || "").toLowerCase().includes(term)
    );
  }, [items, filter]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadQueue((prev) => [
      ...prev,
      ...list.map((f) => ({
        name: f.name,
        status: "uploading" as const,
      })),
    ]);

    for (const file of list) {
      try {
        const url = await uploadOne(file);
        if (!url) throw new Error("No public URL returned");
        const created = await createTestimonial({
          image_url: url,
          source: defaultSource,
          active: true,
        });
        if (created) {
          setItems((prev) => [created, ...prev]);
        }
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.name === file.name && q.status === "uploading"
              ? { ...q, status: "done" }
              : q
          )
        );
      } catch (err) {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.name === file.name && q.status === "uploading"
              ? {
                  ...q,
                  status: "error",
                  error: err instanceof Error ? err.message : String(err),
                }
              : q
          )
        );
      }
    }

    // Clear "done" entries after a moment so the queue stays tidy.
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((q) => q.status !== "done"));
    }, 2400);
  }

  // Native HTML5 drag-and-drop on the dropzone label.
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      el.classList.add("ring-1", "ring-gold-400/60", "bg-gold-400/5");
    };
    const onDragLeave = () => {
      el.classList.remove("ring-1", "ring-gold-400/60", "bg-gold-400/5");
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove("ring-1", "ring-gold-400/60", "bg-gold-400/5");
      void handleFiles(e.dataTransfer?.files ?? null);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
    // handleFiles uses defaultSource via closure — fine to re-bind on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSource]);

  async function handleSave(id: string, patch: Partial<Testimonial>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        testimonial?: Testimonial;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Save failed");
      }
      if (data.testimonial) {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? (data.testimonial as Testimonial) : t))
        );
      }
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this testimonial? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
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
      setItems((prev) => prev.filter((t) => t.id !== id));
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
          <h1 className="font-display text-3xl text-white">Word of Mouth</h1>
          <p className="mt-1 text-sm text-white/55">
            Drop in screenshots from DMs, iMessage, IG, etc. Each one becomes
            a floating polaroid on the public{" "}
            <Link
              href="/word-of-mouth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-300 underline-offset-4 hover:underline"
            >
              /word-of-mouth ↗
            </Link>{" "}
            page.
          </p>
        </div>
        <input
          type="search"
          placeholder="Filter by source, name, caption…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-sm border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40 sm:w-72"
        />
      </header>

      {warning ? (
        <p className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {warning}
        </p>
      ) : null}

      <section className="rounded-sm border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.22em] text-white/55">
            Add screenshots
          </p>
          <div className="flex items-center gap-2 text-xs text-white/55">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Default source
            </label>
            <select
              value={defaultSource}
              onChange={(e) => setDefaultSource(e.target.value)}
              className="rounded-sm border border-white/10 bg-black px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            >
              {SOURCE_PRESETS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label
          ref={dropRef}
          className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-white/15 bg-black/40 px-6 py-8 text-center text-sm text-white/55 transition hover:border-gold-400/40 hover:text-white"
        >
          <span className="text-2xl text-white/35">+</span>
          <span>Drop screenshots here, or click to browse</span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">
            PNG · JPG · HEIC · multiple at once
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>

        {uploadQueue.length > 0 ? (
          <ul className="mt-4 space-y-1.5 text-xs">
            {uploadQueue.map((q, i) => (
              <li
                key={`${q.name}-${i}`}
                className={`flex items-center gap-2 rounded-sm border px-3 py-2 ${
                  q.status === "error"
                    ? "border-red-400/30 bg-red-400/5 text-red-200"
                    : q.status === "done"
                    ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
                    : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                <span className="font-mono text-[11px] text-white/45">
                  {q.status === "uploading"
                    ? "↑"
                    : q.status === "done"
                    ? "✓"
                    : "!"}
                </span>
                <span className="truncate">{q.name}</span>
                {q.error ? (
                  <span className="ml-auto text-red-200/80">{q.error}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-sm border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-white/55">
            {filter
              ? "No testimonials match that filter."
              : "No testimonials yet. Drop a few screenshots above to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TestimonialCard
              key={t.id}
              row={t}
              productOptions={productOptions}
              isEditing={editingId === t.id}
              onStartEdit={() => setEditingId(t.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => handleSave(t.id, patch)}
              onDelete={() => handleDelete(t.id)}
              onQuickToggle={(active) => handleSave(t.id, { active })}
              saving={savingId === t.id}
              deleting={deletingId === t.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  row: Testimonial;
  productOptions: { id: string; label: string }[];
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Testimonial>) => void;
  onDelete: () => void;
  onQuickToggle: (active: boolean) => void;
  saving: boolean;
  deleting: boolean;
}

function TestimonialCard({
  row,
  productOptions,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onQuickToggle,
  saving,
  deleting,
}: CardProps) {
  const [source, setSource] = useState(row.source || "Instagram");
  const [customerName, setCustomerName] = useState(row.customer_name || "");
  const [caption, setCaption] = useState(row.caption || "");
  const [productId, setProductId] = useState(row.product_id || "");
  const [postedAt, setPostedAt] = useState(toDateInput(row.posted_at));
  const [sortOrder, setSortOrder] = useState(row.sort_order);

  useEffect(() => {
    if (!isEditing) {
      setSource(row.source || "Instagram");
      setCustomerName(row.customer_name || "");
      setCaption(row.caption || "");
      setProductId(row.product_id || "");
      setPostedAt(toDateInput(row.posted_at));
      setSortOrder(row.sort_order);
    }
  }, [
    isEditing,
    row.source,
    row.customer_name,
    row.caption,
    row.product_id,
    row.posted_at,
    row.sort_order,
  ]);

  return (
    <article
      className={`relative flex flex-col rounded-sm border bg-white/[0.02] transition ${
        row.active ? "border-white/10" : "border-amber-400/30 opacity-60"
      }`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-sm bg-black/40">
        <Image
          src={row.image_url}
          alt={row.caption || "Testimonial screenshot"}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-contain"
          placeholder="blur"
          blurDataURL={LUXE_BLUR_DATA_URL}
          unoptimized={shouldUnoptimize(row.image_url)}
        />
        {!row.active ? (
          <span className="absolute left-2 top-2 rounded-full border border-amber-400/40 bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-amber-200 backdrop-blur">
            Hidden
          </span>
        ) : null}
        {row.source ? (
          <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/65 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/85 backdrop-blur">
            {row.source}
          </span>
        ) : null}
      </div>

      {!isEditing ? (
        <div className="space-y-2 p-4">
          {row.customer_name ? (
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">
              {row.customer_name}
            </p>
          ) : null}
          {row.caption ? (
            <p className="text-sm text-white/75">&ldquo;{row.caption}&rdquo;</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-white/40">
            <span>{formatDate(row.posted_at) || "—"}</span>
            <span>order {row.sort_order}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onQuickToggle(!row.active)}
              className="rounded-sm border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65 transition hover:border-gold-400/40 hover:text-gold-100"
            >
              {row.active ? "Hide" : "Show"}
            </button>
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
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Source
              </span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              >
                {SOURCE_PRESETS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Customer name
              </span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sam"
                className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
              Caption (optional)
            </span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              maxLength={300}
              className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              placeholder="A short quote we want to surface beneath the image"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Posted on
              </span>
              <input
                type="date"
                value={postedAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPostedAt(e.target.value)}
                className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Sort order
              </span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
              Linked product (optional)
            </span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
            >
              <option value="">— none —</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
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
              onClick={() =>
                onSave({
                  source: source || null,
                  customer_name: customerName || null,
                  caption: caption || null,
                  product_id: productId || null,
                  posted_at: postedAt
                    ? new Date(`${postedAt}T12:00:00Z`).toISOString()
                    : null,
                  sort_order: sortOrder,
                })
              }
              disabled={saving}
              className="rounded-sm bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

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

async function createTestimonial(payload: {
  image_url: string;
  source?: string | null;
  active?: boolean;
}): Promise<Testimonial | null> {
  const res = await fetch("/api/admin/testimonials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    testimonial?: Testimonial;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Create failed (HTTP ${res.status})`);
  }
  return data.testimonial ?? null;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
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
