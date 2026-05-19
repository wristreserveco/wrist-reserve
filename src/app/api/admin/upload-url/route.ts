import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const BUCKET = "product-media";

/**
 * Supabase Storage keys must stick to a narrow ASCII set, so sanitize
 * aggressively before we ever ask for a signed URL.
 */
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

function extensionFrom(filename: string, contentType: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot > 0) {
    const clean = filename
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (clean.length >= 1 && clean.length <= 5) return clean;
  }
  const fromType = (contentType.split(";")[0].split("/")[1] ?? "").toLowerCase();
  const clean = fromType.replace(/[^a-z0-9]+/g, "");
  return clean || "bin";
}

/**
 * POST /api/admin/upload-url
 *
 * Issues a one-shot signed upload URL so the browser can PUT the file bytes
 * directly to Supabase Storage. This completely bypasses Vercel's 4.5 MB
 * request body cap — the function only round-trips JSON (<1 KB each way).
 *
 * Request:  `{ kind: "image" | "video", filename: string, contentType: string }`
 * Response: `{ path, token, signedUrl, publicUrl }`
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { kind?: string; filename?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind === "video" ? "video" : "image";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType =
    typeof body.contentType === "string" && body.contentType
      ? body.contentType
      : kind === "video"
      ? "video/mp4"
      : "image/jpeg";

  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const stemSource = filename.replace(/\.[^.]+$/, "");
  const base = slugify(stemSource) || "file";
  const ext = extensionFrom(filename, contentType);
  const folder = kind === "video" ? "videos" : "images";
  const rawPath = `${folder}/${ts}-${rand}-${base}.${ext}`;
  // One more scrub in case any weird byte slipped through.
  const path = rawPath.replace(/[^a-z0-9./\-]+/gi, "-");

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    const msg = error?.message || "Could not create upload URL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
  });
}
