import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
// The real cap is enforced by Supabase Storage (`storage.buckets.file_size_limit`).
// Migration 012 raises it to 500 MB — adjust there if you need something bigger.
export const maxDuration = 300;

const BUCKET = "product-media";

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type.split("/")[1];
  return (fromType ?? "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function POST(request: Request) {
  // Require admin auth via cookie session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }

  const kind = (form.get("kind") as string | null) ?? "image";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const uploaded: { url: string; path: string; mimeType: string; size: number }[] = [];

  for (const file of files) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
    const ext = extensionFor(file);
    const folder = kind === "video" ? "videos" : "images";
    const path = `${folder}/${ts}-${rand}-${base}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: upErr } = await service.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
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
    uploaded.push({
      url: pub.publicUrl,
      path,
      mimeType: file.type,
      size: file.size,
    });
  }

  return NextResponse.json({ files: uploaded });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let path = body.path;
  if (!path && body.url) {
    const idx = body.url.indexOf(`/${BUCKET}/`);
    if (idx >= 0) path = body.url.slice(idx + BUCKET.length + 2);
  }
  if (!path) {
    return NextResponse.json({ error: "path or url required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.storage.from(BUCKET).remove([path]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
