import { NextResponse } from "next/server";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

const CLEAR = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
};

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("wr_chat_email", "", CLEAR);
  res.cookies.set("wr_chat_name", "", CLEAR);
  return res;
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `chat-session:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  let body: { email?: string; name?: string };
  try {
    body = (await request.json()) as { email?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const name = body.name?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  };
  res.cookies.set("wr_chat_email", email, cookieOpts);
  if (name) {
    res.cookies.set("wr_chat_name", name, cookieOpts);
  }
  return res;
}
