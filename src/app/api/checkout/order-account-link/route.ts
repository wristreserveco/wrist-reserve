import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_MESSAGE =
  "Check your email (including spam) for a secure sign-in link. It only goes to the address we have for this order.";

/**
 * POST /api/checkout/order-account-link
 * Body: { orderId: string }
 *
 * Sends a Supabase magic-link to the email stored on a **paid** order.
 * Always returns the same success copy when the order id is well-formed so
 * callers cannot probe which UUIDs are valid.
 */
export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `order-account-link:${ip}`,
    limit: 5,
    windowSec: 3600,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Sign-in is not configured right now." },
      { status: 503 }
    );
  }

  let body: { orderId?: string };
  try {
    body = (await request.json()) as { orderId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = body.orderId?.trim() ?? "";
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  }

  const origin = new URL(request.url).origin;

  try {
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, email, payment_status, customer_name")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }

    const email = typeof order.email === "string" ? order.email.trim() : "";
    if (order.payment_status !== "paid" || !email || !email.includes("@")) {
      return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const name =
      typeof order.customer_name === "string" ? order.customer_name.trim() : "";

    const { error: otpErr } = await authClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/shop`,
        data: name ? { full_name: name.slice(0, 120) } : undefined,
      },
    });

    if (otpErr) {
      console.error("[order-account-link] signInWithOtp:", otpErr.message);
    }
  } catch (e) {
    console.error("[order-account-link]", e);
  }

  return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
}
