import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import type { MessageRow } from "@/lib/types";

export async function GET() {
  const cookieStore = await cookies();
  const email = cookieStore.get("wr_chat_email")?.value;
  if (!email) {
    return NextResponse.json({ messages: [] satisfies MessageRow[] });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ messages: [], notice: "service_role_unset" });
  }

  try {
    const supabase = createServiceClient();
    const full = "id, user_email, user_name, message, sender, read_at, created_at";
    let { data, error } = await supabase
      .from("messages")
      .select(full)
      .eq("user_email", email)
      .order("created_at", { ascending: true });

    if (error && (error.message?.includes("user_name") || error.message?.includes("read_at"))) {
      const fallback = await supabase
        .from("messages")
        .select("id, user_email, message, sender, created_at")
        .eq("user_email", email)
        .order("created_at", { ascending: true });
      data = fallback.data as typeof data;
      error = fallback.error ?? null;
    }

    if (error) throw error;
    return NextResponse.json({ messages: (data ?? []) as MessageRow[] });
  } catch {
    return NextResponse.json({ messages: [] satisfies MessageRow[] });
  }
}
