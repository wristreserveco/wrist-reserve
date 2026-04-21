import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_BRANDS } from "@/lib/data/default-categories";

export const runtime = "nodejs";

/**
 * Idempotently seed the default brand + sub-category taxonomy.
 * Safe to re-run: existing slugs are skipped, so your manual edits and any
 * re-ordering you've done are preserved.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Fetch existing slugs up-front so we can skip without ever hitting a
  // conflict (works whether or not the unique index from migration 011 exists).
  const { data: existing, error: readErr } = await service
    .from("categories")
    .select("id, slug, parent_id");
  if (readErr) {
    if (
      /public\.categories|relation .* does not exist|schema cache/i.test(
        readErr.message
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The `categories` table doesn't exist yet. Run the SQL migrations under supabase/migrations/ first (007 → 012).",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  const existingBySlug = new Map<string, { id: string }>(
    (existing ?? []).map((r) => [r.slug as string, { id: r.id as string }])
  );

  let createdParents = 0;
  let createdChildren = 0;
  const errors: string[] = [];

  for (let i = 0; i < DEFAULT_BRANDS.length; i++) {
    const brand = DEFAULT_BRANDS[i];
    let parentId = existingBySlug.get(brand.slug)?.id;

    if (!parentId) {
      const { data, error } = await service
        .from("categories")
        .insert({
          name: brand.name,
          slug: brand.slug,
          tagline: brand.tagline,
          sort_order: (i + 1) * 10,
          active: true,
        })
        .select("id")
        .single();
      if (error || !data) {
        errors.push(`${brand.slug}: ${error?.message ?? "insert failed"}`);
        continue;
      }
      parentId = data.id as string;
      existingBySlug.set(brand.slug, { id: parentId });
      createdParents += 1;
    }

    for (const child of brand.children) {
      if (existingBySlug.has(child.slug)) continue;
      const { data, error } = await service
        .from("categories")
        .insert({
          name: child.name,
          slug: child.slug,
          parent_id: parentId,
          sort_order: 0,
          active: true,
        })
        .select("id")
        .single();
      if (error || !data) {
        errors.push(`${child.slug}: ${error?.message ?? "insert failed"}`);
        continue;
      }
      existingBySlug.set(child.slug, { id: data.id as string });
      createdChildren += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    createdParents,
    createdChildren,
    skipped:
      DEFAULT_BRANDS.length -
      createdParents +
      DEFAULT_BRANDS.reduce((n, b) => n + b.children.length, 0) -
      createdChildren,
    errors: errors.length > 0 ? errors : undefined,
  });
}
