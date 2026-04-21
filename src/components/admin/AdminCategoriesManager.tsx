"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { categoryTree, mapCategory, slugify } from "@/lib/products";
import type { Category } from "@/lib/types";
import { SingleImagePicker } from "@/components/admin/SingleImagePicker";

interface FormState {
  id?: string;
  name: string;
  slug: string;
  tagline: string;
  image_url: string | null;
  parent_id: string | null;
  active: boolean;
  slugEdited: boolean;
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    tagline: "",
    image_url: null,
    parent_id: null,
    active: true,
    slugEdited: false,
  };
}

export function AdminCategoriesManager() {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (qErr) {
      // Most common failure: migrations haven't been run yet, so `categories`
      // doesn't exist in the schema cache. Surface a clear next-step.
      if (
        /public\.categories|relation .* does not exist|schema cache/i.test(
          qErr.message
        )
      ) {
        setError(
          "The `categories` table doesn't exist yet. Open Supabase → SQL Editor and run supabase/migrations/007 through 012 in order. Then refresh this page."
        );
      } else {
        setError(qErr.message);
      }
      setRows([]);
    } else {
      setRows((data ?? []).map((r) => mapCategory(r as Record<string, unknown>)));
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

  function openEdit(c: Category) {
    setForm({
      id: c.id,
      name: c.name,
      slug: c.slug,
      tagline: c.tagline ?? "",
      image_url: c.image_url,
      parent_id: c.parent_id,
      active: c.active,
      slugEdited: true,
    });
    setModalOpen(true);
  }

  function openCreateChild(parent: Category) {
    setForm({ ...emptyForm(), parent_id: parent.id });
    setModalOpen(true);
  }

  async function importDefaults() {
    if (seeding) return;
    setSeeding(true);
    setSeedMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/categories/seed", { method: "POST" });
      const data = (await res.json()) as {
        createdParents?: number;
        createdChildren?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Seed failed");
      const total = (data.createdParents ?? 0) + (data.createdChildren ?? 0);
      setSeedMessage(
        total > 0
          ? `Imported ${data.createdParents} brands + ${data.createdChildren} models`
          : "Everything already exists — nothing to import"
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const name = form.name.trim();
    const slug =
      (form.slug.trim() || slugify(name)).toLowerCase();
    if (!name || !slug) {
      setError("Name is required.");
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      slug,
      tagline: form.tagline.trim() || null,
      image_url: form.image_url || null,
      parent_id: form.parent_id || null,
      active: form.active,
    };

    const trySave = async (data: Record<string, unknown>) => {
      if (form.id) {
        return supabase.from("categories").update(data).eq("id", form.id);
      }
      return supabase
        .from("categories")
        .insert({ ...data, sort_order: rows.length });
    };

    let res = await trySave(payload);
    // If parent_id column isn't migrated yet, retry without it.
    if (
      res.error &&
      /parent_id/.test(res.error.message)
    ) {
      delete payload.parent_id;
      res = await trySave(payload);
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
    if (
      !confirm("Delete this category? Products referencing it will lose the link.")
    )
      return;
    const supabase = createClient();
    const { error: dErr } = await supabase.from("categories").delete().eq("id", id);
    if (dErr) setError(dErr.message);
    await load();
  }

  async function toggleActive(c: Category) {
    const supabase = createClient();
    await supabase.from("categories").update({ active: !c.active }).eq("id", c.id);
    await load();
  }

  async function persistGroupOrder(
    parentId: string | null,
    next: Category[]
  ) {
    // Replace only the items in this parent group; keep others untouched.
    setRows((prev) => {
      const others = prev.filter((c) => (c.parent_id ?? null) !== parentId);
      return [...others, ...next];
    });
    const supabase = createClient();
    await Promise.all(
      next.map((c, i) =>
        supabase.from("categories").update({ sort_order: i }).eq("id", c.id)
      )
    );
  }

  const topLevel = useMemo(
    () =>
      rows
        .filter((c) => !c.parent_id || !rows.some((r) => r.id === c.parent_id))
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        }),
    [rows]
  );

  const childrenOf = useCallback(
    (parentId: string) =>
      rows
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        }),
    [rows]
  );

  const parentOptions = useMemo(
    () =>
      categoryTree(rows).filter(
        (n) =>
          // Prevent assigning the category to itself or to one of its
          // descendants (would create a cycle). And we only allow one level
          // of nesting — children can't have children of their own.
          n.depth === 0 && n.category.id !== form.id
      ),
    [rows, form.id]
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Categories</h1>
          <p className="mt-2 text-sm text-white/45">
            Group your catalog. Drag to reorder — this is the order used
            everywhere (nav, filters, hero).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void importDefaults()}
            disabled={seeding}
            className="rounded-sm border border-white/15 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/75 transition hover:border-white hover:text-white disabled:opacity-50"
            title="Idempotently create the full default brand list (Rolex, AP, Patek, …) with sub-categories."
          >
            {seeding ? "Importing…" : "Import default brands"}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
          >
            + Add category
          </button>
        </div>
      </div>

      {seedMessage ? (
        <p className="mt-6 text-sm text-emerald-300/90">{seedMessage}</p>
      ) : null}
      {error ? <p className="mt-6 text-sm text-red-400/90">{error}</p> : null}

      {loading ? (
        <p className="mt-10 text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-sm border border-dashed border-white/10 bg-zinc-950/60 p-16 text-center">
          <p className="font-display text-xl text-white">No categories yet.</p>
          <p className="max-w-md text-sm text-white/55">
            For a watch store, your &ldquo;categories&rdquo; are really just{" "}
            <span className="text-white">brands</span> — Rolex, AP, Patek… with{" "}
            <span className="text-white">sub-categories</span> per model
            (Submariner, GMT-Master II, …).
          </p>
          <p className="max-w-md text-xs text-white/40">
            Click below to import the full default taxonomy in one go. You can edit,
            hide, or add to it afterwards.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void importDefaults()}
              disabled={seeding}
              className="rounded-sm bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200 disabled:opacity-50"
            >
              {seeding ? "Importing…" : "Import default brands"}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-sm border border-white/15 px-5 py-2 text-xs uppercase tracking-[0.2em] text-white/75 transition hover:border-white hover:text-white"
            >
              Or add one manually
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <Reorder.Group
            axis="y"
            values={topLevel}
            onReorder={(n) => void persistGroupOrder(null, n)}
            className="space-y-3"
          >
            {topLevel.map((c) => {
              const kids = childrenOf(c.id);
              return (
                <Reorder.Item
                  key={c.id}
                  value={c}
                  className="rounded-sm border border-white/10 bg-zinc-950/80 transition hover:border-gold-400/30"
                >
                  <CategoryRow
                    c={c}
                    depth={0}
                    onEdit={() => openEdit(c)}
                    onDelete={() => void onDelete(c.id)}
                    onToggle={() => void toggleActive(c)}
                    onAddChild={() => openCreateChild(c)}
                  />
                  {kids.length > 0 ? (
                    <Reorder.Group
                      axis="y"
                      values={kids}
                      onReorder={(n) => void persistGroupOrder(c.id, n)}
                      className="border-t border-white/5 bg-black/30 py-1"
                    >
                      {kids.map((k) => (
                        <Reorder.Item
                          key={k.id}
                          value={k}
                          className="transition hover:bg-white/[0.02]"
                        >
                          <CategoryRow
                            c={k}
                            depth={1}
                            onEdit={() => openEdit(k)}
                            onDelete={() => void onDelete(k.id)}
                            onToggle={() => void toggleActive(k)}
                          />
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  ) : null}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>
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
              className="w-full max-w-md space-y-5 rounded-sm border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <h2 className="font-display text-xl text-white">
                {form.id ? "Edit category" : "New category"}
              </h2>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: f.slugEdited ? f.slug : slugify(e.target.value),
                    }))
                  }
                  required
                  placeholder="Rolex Sport, Patek Sport, Dive…"
                  className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Slug (URL)
                </label>
                <input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: slugify(e.target.value),
                      slugEdited: true,
                    }))
                  }
                  placeholder="rolex-sport"
                  className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Parent category (optional)
                </label>
                <select
                  value={form.parent_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      parent_id: e.target.value || null,
                    }))
                  }
                  className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                >
                  <option value="">— Top-level (brand) —</option>
                  {parentOptions.map(({ category }) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-white/35">
                  Pick a parent to make this a sub-category (e.g. set
                  <span className="px-1 text-white/55">Rolex</span>as parent for
                  <span className="px-1 text-white/55">GMT</span>).
                </p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Tagline (optional)
                </label>
                <input
                  value={form.tagline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tagline: e.target.value }))
                  }
                  placeholder="Sport references with ceramic bezels."
                  className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold-400/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Cover image
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

              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                  className="h-4 w-4 accent-gold-400"
                />
                Active (visible on storefront)
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

function CategoryRow({
  c,
  depth,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
}: {
  c: Category;
  depth: 0 | 1;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddChild?: () => void;
}) {
  return (
    <div
      className="flex cursor-grab items-center gap-3 p-3 active:cursor-grabbing"
      style={{ paddingLeft: depth === 0 ? undefined : 56 }}
    >
      <span className="text-white/30" aria-hidden>
        {depth === 0 ? "⋮⋮" : "↳"}
      </span>
      <div
        className={`shrink-0 overflow-hidden rounded-sm bg-black ${
          depth === 0 ? "h-12 w-12" : "h-9 w-9"
        }`}
      >
        {c.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={c.image_url}
            alt={c.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.18em] text-white/25">
            No img
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-display text-white ${
            depth === 0 ? "text-base" : "text-sm text-white/90"
          }`}
        >
          {c.name}
        </p>
        <p className="truncate text-[10px] uppercase tracking-[0.18em] text-white/35">
          /{c.slug}
          {c.tagline ? ` · ${c.tagline}` : ""}
        </p>
      </div>
      {!c.active ? (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/55">
          Hidden
        </span>
      ) : null}
      {onAddChild ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 hover:border-gold-400/40 hover:text-white"
          title="Add sub-category"
        >
          + Sub
        </button>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60 hover:border-white hover:text-white"
      >
        {c.active ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-sm border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 hover:border-white hover:text-white"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-sm px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-red-400"
      >
        Delete
      </button>
    </div>
  );
}
