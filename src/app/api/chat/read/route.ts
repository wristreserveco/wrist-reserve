import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const cookieStore = await cookies();
  const email = cookieStore.get("wr_chat_email")?.value;
  if (!email) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, updated: 0, notice: "service_role_unset" });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("user_email", email)
      .eq("sender", "admin")
      .is("read_at", null)
      .select("id");

    if (error && error.message?.includes("read_at")) {
      return NextResponse.json({ ok: true, updated: 0, notice: "column_missing" });
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  } catch {
    return NextResponse.json({ ok: false, updated: 0 }, { status: 500 });
  }
}
