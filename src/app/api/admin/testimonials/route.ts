import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  image_url?: string;
  source?: string | null;
  customer_name?: string | null;
  caption?: string | null;
  product_id?: string | null;
  posted_at?: string | null;
  sort_order?: number;
  active?: boolean;
}

async function requireAdmin() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  return user;
}

/**
 * GET /api/admin/testimonials
 *
 * Returns every row (including inactive / unsorted) so the admin grid can
 * manage the full set. The public page (/word-of-mouth) uses a different
 * query that filters to `active = true` only.
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (/relation|table .* does not exist/i.test(error.message)) {
      return NextResponse.json({
        testimonials: [],
        warning: "Run migration 022_testimonials.sql in Supabase to enable Word of Mouth.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ testimonials: data ?? [] });
}

/**
 * POST /api/admin/testimonials
 *
 * Creates one row. The image_url is expected to already be uploaded to
 * Supabase storage (the admin UI uses /api/admin/upload-url for that, same
 * pattern as product media), so this endpoint just persists metadata.
 */
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageUrl = (body.image_url ?? "").trim();
  if (!imageUrl) {
    return NextResponse.json(
      { error: "image_url is required" },
      { status: 400 }
    );
  }

  const insertRow: Record<string, unknown> = {
    image_url: imageUrl,
    source: body.source?.trim() || null,
    customer_name: body.customer_name?.trim() || null,
    caption: body.caption?.trim() || null,
    product_id: body.product_id?.trim() || null,
    posted_at: body.posted_at || null,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    active: body.active === false ? false : true,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("testimonials")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) {
    if (/relation|table .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Run migration 022_testimonials.sql in Supabase first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, testimonial: data });
}
