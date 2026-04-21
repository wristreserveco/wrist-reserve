"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

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
      const isVideo = file.type.startsWith("video/");
      const form = new FormData();
      form.append("kind", isVideo ? "video" : "image");
      form.append("files", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = (await res.json()) as {
        files?: { url: string }[];
        error?: string;
      };
      if (!res.ok || !data.files?.[0]) {
        throw new Error(data.error || "Upload failed");
      }
      onChange(data.files[0].url);
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
