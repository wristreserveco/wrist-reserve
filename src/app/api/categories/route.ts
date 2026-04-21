import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/env";
import { mapCategory } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json([], { status: 200 });
  }

  const cats = (data ?? []).map((row) => mapCategory(row as Record<string, unknown>));
  return NextResponse.json(cats, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60",
    },
  });
}
