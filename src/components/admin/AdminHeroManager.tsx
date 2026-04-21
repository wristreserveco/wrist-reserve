"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { mapHeroSlide } from "@/lib/products";
import type { HeroSlide } from "@/lib/types";
import { SingleImagePicker } from "@/components/admin/SingleImagePicker";

interface FormState {
  id?: string;
  title: string;
  tagline: string;
  image_url: string | null;
  video_url: string | null;
  cta_label: string;
  cta_href: string;
  active: boolean;
}

function emptyForm(): FormState {
  return {
    title: "",
    tagline: "",
    image_url: null,
    video_url: null,
    cta_label: "",
    cta_href: "",
    active: true,
  };
}

export function AdminHeroManager() {
  const [rows, setRows] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from("hero_slides")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data ?? []).map((r) => mapHeroSlide(r as Record<string, unknown>)));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(s: HeroSlide) {
    setForm({
      id: s.id,
      title: s.title,
      tagline: s.tagline ?? "",
      image_url: s.image_url,
      video_url: s.video_url,
      cta_label: s.cta_label ?? "",
      cta_href: s.cta_href ?? "",
      active: s.active,
    });
    setModalOpen(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      title,
      tagline: form.tagline.trim() || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      cta_label: form.cta_label.trim() || null,
      cta_href: form.cta_href.trim() || null,
      active: form.active,
    };
    let res;
    if (form.id) {
      res = await supabase.from("hero_slides").update(payload).eq("id", form.id);
    } else {
      res = await supabase
        .from("hero_slides")
        .insert({ ...payload, sort_order: rows.length });
    }
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this hero slide?")) return;
    const supabase = createClient();
    await supabase.from("hero_slides").delete().eq("id", id);
    await load();
  }

  async function toggleActive(s: HeroSlide) {
    const supabase = createClient();
    await supabase.from("hero_slides").update({ active: !s.active }).eq("id", s.id);
    await load();
  }

  async function persistOrder(next: HeroSlide[]) {
    setRows(next);
    const supabase = createClient();
    await Promise.all(
      next.map((s, i) =>
        supabase.from("hero_slides").update({ sort_order: i }).eq("id", s.id)
      )
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Hero</h1>
          <p className="mt-2 text-sm text-white/45">
            Control the landing page carousel. Drag to reorder. Hide slides with
            the show/hide toggle instead of deleting when you want to rotate
            campaigns.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
        >
          + Add slide
        </button>
      </div>

      {error ? <p className="mt-6 text-sm text-red-400/90">{error}</p> : null}

      {loading ? (
        <p className="mt-10 text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-sm border border-dashed border-white/10 bg-zinc-950/60 p-16 text-center">
          <p className="font-display text-xl text-white">No slides yet.</p>
          <p className="max-w-md text-sm text-white/45">
            Until you add slides the homepage falls back to the built-in
            category carousel. Add your first slide to take full control.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-2 rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
          >
            Add your first slide
          </button>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={rows}
          onReorder={(n) => void persistOrder(n)}
          className="mt-8 space-y-3"
        >
          {rows.map((s) => {
            const isVid = Boolean(s.video_url);
            const preview = s.image_url || s.video_url;
            return (
              <Reorder.Item
                key={s.id}
                value={s}
                className="flex cursor-grab items-center gap-4 rounded-sm border border-white/10 bg-zinc-950/80 p-3 transition hover:border-gold-400/30 active:cursor-grabbing"
              >
                <span className="text-white/30" aria-hidden>⋮⋮</span>
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-sm bg-black">
                  {preview ? (
                    isVid ? (
                      <video
                        src={s.video_url ?? undefined}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={preview}
                        alt={s.title}
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.18em] text-white/25">
                      No media
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base text-white">
                    {s.title}
                  </p>
                  {s.tagline ? (
                    <p className="line-clamp-1 text-[11px] text-white/50">
                      {s.tagline}
                    </p>
                  ) : null}
                  {s.cta_label || s.cta_href ? (
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-gold-300/80">
                      {s.cta_label ?? "CTA"} → {s.cta_href ?? "—"}
                    </p>
                  ) : null}
                </div>
                {!s.active ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/55">
                    Hidden
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void toggleActive(s)}
                  className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60 hover:border-white hover:text-white"
                >
                  {s.active ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="rounded-sm border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 hover:border-white hover:text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  className="rounded-sm px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-red-400"
                >
                  Delete
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      <AnimatePresence>
        {modalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => !saving && setModalOpen(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onSubmit={(e) => void onSave(e)}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-sm border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <h2 className="font-display text-xl text-white">
                {form.id ? "Edit slide" : "New hero slide"}
              </h2>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  required
                  placeholder="Submariner Season"
                  className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Tagline
                </label>
                <textarea
                  value={form.tagline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tagline: e.target.value }))
                  }
                  rows={2}
                  placeholder="The dive icon — 300m rated, ceramic bezel, integrated presence."
                  className="mt-2 w-full resize-none rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Background image
                  </label>
                  <div className="mt-2">
                    <SingleImagePicker
                      value={form.image_url}
                      onChange={(url) =>
                        setForm((f) => ({ ...f, image_url: url }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Background video (optional)
                  </label>
                  <div className="mt-2">
                    <SingleImagePicker
                      value={form.video_url}
                      onChange={(url) =>
                        setForm((f) => ({ ...f, video_url: url }))
                      }
                      label="Drop a short video clip"
                      acceptVideo
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    CTA label
                  </label>
                  <input
                    value={form.cta_label}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cta_label: e.target.value }))
                    }
                    placeholder="Shop Submariner"
                    className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    CTA link
                  </label>
                  <input
                    value={form.cta_href}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cta_href: e.target.value }))
                    }
                    placeholder="/shop or /categories/submariner"
                    className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                  className="h-4 w-4 accent-gold-400"
                />
                Active (show on homepage)
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="text-xs uppercase tracking-[0.18em] text-white/55 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
