import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRates, type ShippoAddress } from "@/lib/shipping/shippo";
import { isShippoConfigured } from "@/lib/shipping/config";

export const runtime = "nodejs";

interface Body {
  to: ShippoAddress;
  quantity?: number;
  parcel?: { length?: number; width?: number; height?: number; weight?: number };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isShippoConfigured()) {
    return NextResponse.json(
      {
        error:
          "Shippo isn't configured yet. Set SHIPPO_API_TOKEN and the SHIPPO_FROM_* env vars in Vercel.",
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
  if (!body.to?.street1 || !body.to.city || !body.to.zip || !body.to.state) {
    return NextResponse.json(
      { error: "Recipient address is missing required fields." },
      { status: 400 }
    );
  }
  void params; // Order id reserved for audit log expansion.

  try {
    const result = await fetchRates({
      to: { ...body.to, country: body.to.country || "US" },
      quantity: Math.max(1, Number(body.quantity ?? 1)),
      parcelOverride: body.parcel,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch rates";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
