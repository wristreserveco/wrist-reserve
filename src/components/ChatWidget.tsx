"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow, AttachmentKind } from "@/lib/types";
import { SeenStatus, SendingStatus, SentStatus } from "@/components/chat/SeenStatus";
import {
  MediaLightbox,
  type LightboxMedia,
} from "@/components/chat/MediaLightbox";

interface ChatProfile {
  name: string;
  email: string;
}

interface PendingAttachment {
  file: File;
  previewUrl: string;
  type: AttachmentKind;
}

const PROFILE_KEY = "wr_chat_profile_v1";

function loadProfile(): ChatProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatProfile;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "•";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "•";
}

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = loadProfile();
    if (stored) {
      setProfile(stored);
      setNameInput(stored.name);
      setEmailInput(stored.email);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/history", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: MessageRow[] };
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch {
      /* silent */
    }
  }, []);

  const markAdminMessagesRead = useCallback(async () => {
    try {
      await fetch("/api/chat/read", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (!open || !profile) return;
    void loadHistory().then(() => markAdminMessagesRead());
    const id = setInterval(() => {
      void loadHistory();
    }, 2000);
    return () => clearInterval(id);
  }, [open, profile, loadHistory, markAdminMessagesRead]);

  useEffect(() => {
    if (!open || !profile) return;
    const hasUnreadAdmin = messages.some(
      (m) => m.sender === "admin" && !m.read_at
    );
    if (hasUnreadAdmin) {
      void markAdminMessagesRead();
    }
  }, [messages, open, profile, markAdminMessagesRead]);

  useEffect(() => {
    if (open && profile) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, profile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Revoke any object URL we created for the local preview when it changes.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  const canStart = useMemo(
    () =>
      nameInput.trim().length >= 1 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim()),
    [nameInput, emailInput]
  );

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) {
      setError("Enter a valid name and email.");
      return;
    }
    setError(null);
    setLoadingProfile(true);
    const next: ChatProfile = {
      name: nameInput.trim(),
      email: emailInput.trim(),
    };
    try {
      await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        credentials: "include",
      });
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      setProfile(next);
      await loadHistory();
    } catch {
      setError("Could not start chat.");
    } finally {
      setLoadingProfile(false);
    }
  }

  function onPickAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be picked again
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large (15MB max).");
      return;
    }
    const kind: AttachmentKind = file.type.startsWith("video/") ? "video" : "image";
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending({
      file,
      type: kind,
      previewUrl: URL.createObjectURL(file),
    });
    setError(null);
  }

  function removePending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }

  async function uploadPending(): Promise<{
    url: string;
    type: AttachmentKind;
    name: string;
  } | null> {
    if (!pending) return null;
    const form = new FormData();
    form.append("file", pending.file);
    setUploading(true);
    try {
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await res.json()) as {
        url?: string;
        type?: AttachmentKind;
        name?: string;
        error?: string;
      };
      if (!res.ok || !data.url || !data.type) {
        throw new Error(data.error || "Upload failed");
      }
      return { url: data.url, type: data.type, name: data.name ?? "" };
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !pending) || !profile) return;

    const tmpId = `tmp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tmpId,
      user_email: profile.email,
      user_name: profile.name,
      message: body || null,
      sender: "user",
      attachment_url: pending?.previewUrl ?? null,
      attachment_type: pending?.type ?? null,
      attachment_name: pending?.file.name ?? null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setSubmitting(true);
    setError(null);

    const hadPending = Boolean(pending);
    try {
      let attachment: {
        url: string;
        type: AttachmentKind;
        name: string;
      } | null = null;
      if (pending) {
        attachment = await uploadPending();
        removePending();
      }

      const supabase = createClient();
      const payload: Record<string, unknown> = {
        user_email: profile.email,
        user_name: profile.name,
        message: body || null,
        sender: "user",
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_name: attachment?.name ?? null,
      };

      let res = await supabase.from("messages").insert(payload);

      // Graceful fallbacks for installs that haven't migrated yet.
      const drop = (col: string) => {
        delete payload[col];
      };
      const unknownCols = /attachment_url|attachment_type|attachment_name|user_name/;
      while (
        res.error &&
        unknownCols.test(res.error.message) &&
        (payload.attachment_url !== undefined ||
          payload.attachment_type !== undefined ||
          payload.attachment_name !== undefined ||
          payload.user_name !== undefined)
      ) {
        if (res.error.message.includes("attachment_url")) drop("attachment_url");
        else if (res.error.message.includes("attachment_type")) drop("attachment_type");
        else if (res.error.message.includes("attachment_name")) drop("attachment_name");
        else if (res.error.message.includes("user_name")) drop("user_name");
        else break;
        res = await supabase.from("messages").insert(payload);
      }

      if (res.error) throw res.error;
      await loadHistory();
    } catch {
      setError(
        hadPending
          ? "Attachment could not be sent — check file and try again."
          : "Message could not be sent."
      );
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
    } finally {
      setSubmitting(false);
    }
  }

  function resetProfile() {
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setMessages([]);
  }

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-gold-500/30 bg-black/80 text-gold-200 shadow-lg backdrop-blur transition hover:border-gold-400/50 hover:bg-zinc-950"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.15em]">Chat</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end justify-end bg-black/60 p-4 sm:items-center sm:justify-end sm:p-8"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="flex h-[min(620px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-sm border border-white/10 bg-zinc-950 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  {profile ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/30 bg-black text-[11px] font-semibold tracking-wider text-gold-200">
                      {initials(profile.name)}
                    </span>
                  ) : null}
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-400/90">Concierge</p>
                    <p className="text-sm text-white/85">
                      {profile ? `Hi, ${profile.name.split(" ")[0]}` : "Wrist Reserve"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {profile ? (
                    <button
                      type="button"
                      onClick={resetProfile}
                      className="rounded-sm px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 transition hover:text-white"
                      aria-label="Sign out of chat"
                    >
                      Switch
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-sm px-2 py-1 text-xs text-white/50 transition hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {!profile ? (
                  <form onSubmit={startChat} className="space-y-4">
                    <div>
                      <p className="font-display text-lg text-white">
                        How can we help?
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        Share your details and our team replies within the hour.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-white/45">
                        Name
                      </label>
                      <input
                        autoFocus
                        value={nameInput}
                        onChange={(ev) => setNameInput(ev.target.value)}
                        placeholder="Full name"
                        className="w-full rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-white/45">
                        Email
                      </label>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(ev) => setEmailInput(ev.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/30"
                      />
                    </div>
                    {error ? <p className="text-xs text-red-400/90">{error}</p> : null}
                    <button
                      type="submit"
                      disabled={loadingProfile || !canStart}
                      className="w-full rounded-sm bg-white py-2.5 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:opacity-50"
                    >
                      {loadingProfile ? "Starting…" : "Start chat"}
                    </button>
                  </form>
                ) : (
                  <>
                    {messages.length === 0 ? (
                      <div className="py-6 text-center text-xs text-white/35">
                        Send your first message — we&apos;ll get right back to you.
                      </div>
                    ) : null}
                    {(() => {
                      const ownMessages = messages.filter((m) => m.sender === "user");
                      const lastOwn = ownMessages[ownMessages.length - 1];
                      const lastReadOwn = [...ownMessages]
                        .reverse()
                        .find((m) => m.read_at);
                      return messages.map((m) => {
                        const isOwn = m.sender === "user";
                        const isPending =
                          isOwn &&
                          typeof m.id === "string" &&
                          m.id.startsWith("tmp-");
                        const showSeen =
                          isOwn && !!m.read_at && m.id === lastReadOwn?.id;
                        const showSent =
                          isOwn &&
                          !isPending &&
                          !m.read_at &&
                          m.id === lastOwn?.id;
                        const hasAttachment =
                          m.attachment_url && m.attachment_type;
                        const hasText = Boolean(m.message && m.message.trim());
                        return (
                          <motion.div
                            key={m.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`flex flex-col gap-1 ${
                              m.sender === "admin" ? "items-start" : "items-end"
                            }`}
                          >
                            {hasAttachment ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightbox({
                                    url: m.attachment_url!,
                                    type: m.attachment_type!,
                                    alt: m.attachment_name ?? "",
                                  })
                                }
                                className="group block max-w-[75%] overflow-hidden rounded-2xl border border-white/10 bg-black/60 transition hover:border-gold-400/40"
                              >
                                {m.attachment_type === "image" ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={m.attachment_url!}
                                    alt={m.attachment_name ?? ""}
                                    className="max-h-[260px] w-auto object-cover transition group-hover:opacity-95"
                                  />
                                ) : (
                                  <video
                                    src={m.attachment_url!}
                                    className="max-h-[260px] w-auto"
                                    muted
                                    loop
                                    autoPlay
                                    playsInline
                                  />
                                )}
                              </button>
                            ) : null}
                            {hasText ? (
                              <div
                                className={`max-w-[80%] rounded-sm px-3 py-2 text-sm leading-relaxed ${
                                  m.sender === "admin"
                                    ? "border border-white/10 bg-black/60 text-white/85"
                                    : "bg-gold-500/15 text-white"
                                }`}
                              >
                                {m.message}
                              </div>
                            ) : null}
                            {showSeen && m.read_at ? (
                              <SeenStatus readAt={m.read_at} align="right" />
                            ) : showSent ? (
                              <SentStatus align="right" />
                            ) : isPending ? (
                              <SendingStatus align="right" />
                            ) : null}
                          </motion.div>
                        );
                      });
                    })()}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {profile ? (
                <form onSubmit={sendMessage} className="border-t border-white/10 p-3">
                  {error ? <p className="mb-2 text-xs text-red-400/90">{error}</p> : null}

                  {/* Pending attachment preview */}
                  {pending ? (
                    <div className="mb-2 flex items-center gap-2 rounded-sm border border-white/10 bg-black/60 p-2">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-black">
                        {pending.type === "image" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={pending.previewUrl}
                            alt={pending.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={pending.previewUrl}
                            className="h-full w-full object-cover"
                            muted
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-[11px] text-white/70">
                        <p className="truncate">{pending.file.name}</p>
                        <p className="text-white/40">
                          {pending.type === "image" ? "Photo" : "Video"} ·{" "}
                          {(pending.file.size / (1024 * 1024)).toFixed(1)}MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removePending}
                        className="rounded-sm px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/45 hover:text-red-400"
                        aria-label="Remove attachment"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || submitting}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-white/10 text-white/55 transition hover:border-gold-400/40 hover:text-white disabled:opacity-40"
                      aria-label="Attach photo or video"
                      title="Attach photo or video"
                    >
                      {/* Paperclip */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.4 17.4a2 2 0 1 1-2.83-2.83l8.49-8.49" />
                      </svg>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                      onChange={onPickAttachment}
                      className="hidden"
                    />
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={(ev) => setText(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" && !ev.shiftKey) {
                          ev.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={pending ? "Add a caption…" : "Type a message"}
                      rows={1}
                      className="max-h-24 flex-1 resize-none rounded-sm border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/30"
                    />
                    <button
                      type="submit"
                      disabled={submitting || uploading || (!text.trim() && !pending)}
                      className="rounded-sm bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-black transition hover:bg-gold-200 disabled:opacity-40"
                    >
                      {uploading ? "Sending…" : "Send"}
                    </button>
                  </div>
                </form>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
