import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent, auditContextFromRequest } from "@/lib/security/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  reviewer_name?: string;
  email?: string | null;
  rating?: number;
  body?: string;
  approved?: boolean;
  /** ISO date or ISO timestamp; clamped to "not in the future". */
  created_at?: string | null;
  /** Replaces the photo array entirely. Pass [] to clear. */
  photos?: string[] | null;
}

async function requireAdmin() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  return user;
}

/**
 * PATCH /api/admin/reviews/:id
 *
 * Edit any field of a review. We re-validate everything server-side so a
 * compromised admin tab can't post a 47-star rating or a 2 MB review body.
 *
 * If the `photos` column doesn't exist yet (pre-migration 021), the update
 * silently retries without that field so other edits still land.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reviewId = params.id?.trim();
  if (!reviewId) {
    return NextResponse.json({ error: "Missing review id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.reviewer_name === "string") {
    const v = body.reviewer_name.trim().slice(0, 80);
    if (!v) {
      return NextResponse.json(
        { error: "Reviewer name cannot be empty" },
        { status: 400 }
      );
    }
    update.reviewer_name = v;
  }
  if (body.email === null) {
    update.email = null;
  } else if (typeof body.email === "string") {
    const v = body.email.trim().slice(0, 180);
    update.email = v || null;
  }
  if (typeof body.rating === "number") {
    const r = Math.min(5, Math.max(1, Math.round(body.rating)));
    update.rating = r;
  }
  if (typeof body.body === "string") {
    const v = body.body.trim().slice(0, 2000);
    if (v.length < 5) {
      return NextResponse.json(
        { error: "Review must be at least a few words" },
        { status: 400 }
      );
    }
    update.body = v;
  }
  if (typeof body.approved === "boolean") {
    update.approved = body.approved;
  }
  if (body.created_at === null) {
    update.created_at = null; // NOT-NULL in schema; falls back to existing
  } else if (typeof body.created_at === "string" && body.created_at) {
    const ts = new Date(body.created_at);
    if (!Number.isNaN(ts.getTime())) {
      const clamped = ts.getTime() > Date.now() ? new Date() : ts;
      update.created_at = clamped.toISOString();
    }
  }
  if (Array.isArray(body.photos)) {
    update.photos = body.photos
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .slice(0, 12);
  } else if (body.photos === null) {
    update.photos = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const supabase = createServiceClient();

  let { data, error } = await supabase
    .from("product_reviews")
    .update(update)
    .eq("id", reviewId)
    .select(
      "id, product_id, reviewer_name, email, rating, body, approved, created_at, photos"
    )
    .single();

  // Photos column missing — strip and retry so other fields still save.
  if (error && /column .* does not exist|photos/i.test(error.message)) {
    const { photos: _photos, ...withoutPhotos } = update;
    void _photos;
    if (Object.keys(withoutPhotos).length > 0) {
      const retry = await supabase
        .from("product_reviews")
        .update(withoutPhotos)
        .eq("id", reviewId)
        .select(
          "id, product_id, reviewer_name, email, rating, body, approved, created_at"
        )
        .single();
      data = retry.data as typeof data;
      error = retry.error;
    } else {
      return NextResponse.json(
        {
          error:
            "Photos column not migrated yet. Run 021_review_photos.sql in Supabase.",
        },
        { status: 503 }
      );
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAuditEvent({
    service: supabase,
    ...auditContextFromRequest(request, user),
    kind: "review.update",
    targetKind: "review",
    targetId: reviewId,
    message: `Edited review ${reviewId}`,
    metadata: { fields: Object.keys(update) },
  });

  return NextResponse.json({ ok: true, review: data });
}

/**
 * DELETE /api/admin/reviews/:id
 *
 * Permanently removes a review. Mirror of the per-product DELETE that lived
 * at /api/products/:id/reviews — we keep both because nothing else depended
 * on the old path, and the new one is the one the admin panel calls.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reviewId = params.id?.trim();
  if (!reviewId) {
    return NextResponse.json({ error: "Missing review id" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("id", reviewId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAuditEvent({
    service: supabase,
    ...auditContextFromRequest(request, user),
    kind: "review.delete",
    targetKind: "review",
    targetId: reviewId,
    message: `Deleted review ${reviewId}`,
  });

  return NextResponse.json({ ok: true });
}
