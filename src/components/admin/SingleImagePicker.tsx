"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

function safeFilename(file: File): string {
  const raw = typeof file?.name === "string" ? file.name : "";
  const dot = raw.lastIndexOf(".");
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot + 1) : "";
  const cleanStem =
    stem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file";
  const cleanExt = ext.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
}

/**
 * Direct-to-Supabase upload via signed URL — bypasses Vercel's 4.5 MB body
 * cap so full-size photos and videos go through.
 */
async function uploadDirect(
  kind: "image" | "video",
  file: File
): Promise<string> {
  const filename = safeFilename(file);
  const contentType =
    file.type || (kind === "video" ? "video/mp4" : "image/jpeg");

  const ticketRes = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, filename, contentType }),
  });
  const ticket = (await ticketRes.json().catch(() => ({}))) as {
    signedUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!ticketRes.ok || !ticket.signedUrl || !ticket.publicUrl) {
    throw new Error(
      ticket.error || `Upload prep failed (HTTP ${ticketRes.status}).`
    );
  }

  const putRes = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!putRes.ok) {
    if (putRes.status === 413) {
      throw new Error("File is over the 500 MB limit. Trim it first.");
    }
    throw new Error(`Storage rejected the upload (HTTP ${putRes.status}).`);
  }
  return ticket.publicUrl;
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  acceptVideo?: boolean;
  className?: string;
}

export function SingleImagePicker({
  value,
  onChange,
  label = "Drop or click to upload",
  acceptVideo = false,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const publicUrl = await uploadDirect(kind, file);
      onChange(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) {
      await upload(e.target.files[0]);
      e.target.value = "";
    }
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      await upload(e.dataTransfer.files[0]);
    }
  }

  const isVideo = Boolean(value && /\.(mp4|webm|mov)(\?|$)/i.test(value));

  return (
    <div className={className}>
      {value ? (
        <div className="group relative overflow-hidden rounded-sm border border-white/10 bg-black">
          {isVideo ? (
            <video
              src={value}
              className="h-40 w-full object-cover"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value} alt="" className="h-40 w-full object-cover" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/40" />
          <div className="absolute inset-x-2 bottom-2 flex justify-between opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-sm bg-white/90 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-black hover:bg-white"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-sm bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white hover:bg-red-500/80"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={`flex h-32 cursor-pointer items-center justify-center rounded-sm border-2 border-dashed text-center transition ${
            dragOver
              ? "border-gold-400 bg-gold-400/5"
              : "border-white/15 bg-black/40 hover:border-white/30"
          }`}
        >
          {uploading ? (
            <span className="text-[11px] uppercase tracking-[0.18em] text-gold-300">
              Uploading…
            </span>
          ) : (
            <span className="px-4 text-xs text-white/60">{label}</span>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={acceptVideo ? "image/*,video/mp4,video/quicktime,video/webm" : "image/*"}
        className="hidden"
        onChange={onFile}
      />
      {error ? (
        <p className="mt-1 text-[11px] text-red-400/80">{error}</p>
      ) : null}
    </div>
  );
}
