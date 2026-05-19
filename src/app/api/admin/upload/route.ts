import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
// The real cap is enforced by Supabase Storage (`storage.buckets.file_size_limit`).
// Migration 012 raises it to 500 MB — adjust there if you need something bigger.
export const maxDuration = 300;

const BUCKET = "product-media";

// Supabase Storage rejects keys with characters outside a conservative set —
// anything non-ASCII, spaces, quotes, %, #, etc. Keep it to [a-z0-9.-] only.
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    // strip combining marks (accents)
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName) {
    const clean = fromName.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (clean.length >= 1 && clean.length <= 5) return clean;
  }
  const fromType = (file.type.split(";")[0].split("/")[1] ?? "").toLowerCase();
  const clean = fromType.replace(/[^a-z0-9]+/g, "");
  return clean || "bin";
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
    // Final safety net: strip anything that somehow slipped through.
    const rawPath = `${folder}/${ts}-${rand}-${base}.${ext}`;
    const path = rawPath.replace(/[^a-z0-9./\-]+/gi, "-");

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: `Upload failed while reading the file (${msg}). If the video is very long try trimming it locally first.`,
        },
        { status: 500 }
      );
    }
    const { error: upErr } = await service.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      upsert: false,
      // 1-year browser cache. Media uploaded via this endpoint is
      // content-addressed (timestamp + random suffix), so the URL never
      // points at different bytes — safe to cache indefinitely. This is
      // critical for keeping Supabase Storage egress under the free
      // plan's 5GB/mo cached-egress cap.
      cacheControl: "31536000, immutable",
    });
    if (upErr) {
      const msg = upErr.message || "";
      const friendly = /string did not match|pattern/i.test(msg)
        ? `Upload failed: that filename has characters Supabase Storage won't accept. Try renaming the file to plain letters/numbers.`
        : /exceeded|too large|size/i.test(msg)
        ? `Upload failed: file is too large (limit 500MB).`
        : `Upload failed: ${msg}`;
      return NextResponse.json({ error: friendly }, { status: 500 });
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
