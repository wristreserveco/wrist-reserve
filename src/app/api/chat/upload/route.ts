import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "product-media";
const MAX_SIZE = 15 * 1024 * 1024; // 15MB per attachment (chat-side).
const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

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

export async function POST(request: Request) {
  // Require a started chat session so random bots can't spam storage.
  const cookieStore = await cookies();
  const email = cookieStore.get("wr_chat_email")?.value;
  if (!email) {
    return NextResponse.json(
      { error: "Start the chat first (name + email)." },
      { status: 401 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Uploads not configured." },
      { status: 503 }
    );
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

  const isImage = ALLOWED_IMAGE.includes(file.type);
  const isVideo = ALLOWED_VIDEO.includes(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Only images (jpg/png/gif/webp) or short videos (mp4/mov/webm) are allowed." },
      { status: 415 }
    );
  }

  const kind: "image" | "video" = isImage ? "image" : "video";
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || kind;
  const ext = extensionFor(file);
  const safeEmail = slugify(email).slice(0, 40);
  const path = `chat/${safeEmail}/${ts}-${rand}-${base}.${ext}`;

  const service = createServiceClient();
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
  return NextResponse.json({
    url: pub.publicUrl,
    path,
    type: kind,
    name: file.name,
    size: file.size,
  });
}
