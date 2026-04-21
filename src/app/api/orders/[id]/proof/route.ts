import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderEvent } from "@/lib/orders/events";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "product-media";
const MAX_SIZE = 15 * 1024 * 1024; // 15MB — receipts are small.
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type.split("/")[1];
  return (fromType ?? "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File is too large (max ${MAX_SIZE / (1024 * 1024)}MB).` },
      { status: 413 }
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Upload a screenshot (JPG/PNG) or PDF receipt." },
      { status: 415 }
    );
  }

  const service = createServiceClient();

  // Make sure the order exists and is still accepting proof (pending only).
  const { data: order, error: orderErr } = await service
    .from("orders")
    .select("id, payment_status, payment_method, email")
    .eq("id", params.id)
    .single();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.payment_status !== "pending") {
    return NextResponse.json(
      { error: "This order is no longer accepting proof uploads." },
      { status: 400 }
    );
  }

  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "receipt";
  const ext = extensionFor(file);
  const path = `proofs/${params.id}/${ts}-${rand}-${base}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await service.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}` },
      { status: 500 }
    );
  }

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);

  // Persist onto the order. If proof columns missing, fall back silently.
  let updateRes = await service
    .from("orders")
    .update({
      proof_url: pub.publicUrl,
      proof_mime: file.type,
      proof_uploaded_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updateRes.error && /proof_|column/.test(updateRes.error.message)) {
    // Try a subset, then give up quietly.
    updateRes = await service
      .from("orders")
      .update({ proof_url: pub.publicUrl })
      .eq("id", params.id);
  }

  await logOrderEvent(service, {
    orderId: params.id,
    kind: "proof_uploaded",
    actor: "buyer",
    message: "Buyer uploaded proof of payment",
    metadata: {
      url: pub.publicUrl,
      mime: file.type,
      size: file.size,
    },
  });

  return NextResponse.json({
    ok: true,
    url: pub.publicUrl,
    mime: file.type,
  });
}
