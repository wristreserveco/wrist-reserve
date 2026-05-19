import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.image_url === "string" && body.image_url.trim()) {
    update.image_url = body.image_url.trim();
  }
  if (body.source !== undefined) update.source = body.source?.trim() || null;
  if (body.customer_name !== undefined)
    update.customer_name = body.customer_name?.trim() || null;
  if (body.caption !== undefined)
    update.caption = body.caption?.trim() || null;
  if (body.product_id !== undefined)
    update.product_id = body.product_id?.trim() || null;
  if (body.posted_at !== undefined) update.posted_at = body.posted_at || null;
  if (typeof body.sort_order === "number") update.sort_order = body.sort_order;
  if (typeof body.active === "boolean") update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("testimonials")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, testimonial: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("testimonials")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
