import { NextResponse } from "next/server";
import { validateAddress, type ShippoAddress } from "@/lib/shipping/shippo";
import { isShippoConfigured } from "@/lib/shipping/config";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
}

/**
 * POST /api/checkout/verify-address
 *
 * Soft-validates a shipping address against Shippo's USPS-backed validation
 * endpoint. Returns the cleaned/standardized version so the client can show
 * "did you mean…?" UX or just submit the normalized form.
 *
 * We deliberately don't *require* validation to pass at the API level — some
 * legitimate addresses (new construction, very rural) fail USPS lookups, and
 * we don't want to block a sale because of a database lag. The buyer can
 * proceed with their original input if they confirm it.
 */
export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `address-verify:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  if (!isShippoConfigured()) {
    return NextResponse.json(
      {
        valid: null,
        message:
          "Address verification is offline right now. Double-check your details and proceed.",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clean = (v: string | undefined) =>
    (typeof v === "string" ? v : "").trim();

  const candidate: ShippoAddress = {
    name: clean(body.name).slice(0, 80),
    street1: clean(body.street1).slice(0, 120),
    street2: clean(body.street2).slice(0, 120) || undefined,
    city: clean(body.city).slice(0, 60),
    state: clean(body.state).toUpperCase().slice(0, 32),
    zip: clean(body.zip).slice(0, 16),
    country: clean(body.country).toUpperCase().slice(0, 2) || "US",
    phone: clean(body.phone).slice(0, 32) || undefined,
    email: clean(body.email).slice(0, 180) || undefined,
  };

  // Trivial required-field guard so we don't burn a Shippo API call on
  // obvious garbage like a half-filled form.
  if (
    !candidate.name ||
    !candidate.street1 ||
    !candidate.city ||
    !candidate.state ||
    !candidate.zip
  ) {
    return NextResponse.json(
      {
        valid: false,
        message:
          "Missing required fields. Name, street, city, state, and ZIP are all required.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await validateAddress(candidate);
    return NextResponse.json({
      valid: result.valid,
      message: result.message,
      normalized: result.normalized,
    });
  } catch (e) {
    // Don't fail the checkout flow on a Shippo outage — surface the error
    // but let the buyer proceed with their typed address if they want.
    const msg = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json(
      {
        valid: null,
        message: `Couldn't reach the address verifier (${msg.slice(0, 120)}). Double-check your details and proceed.`,
      },
      { status: 200 }
    );
  }
}
