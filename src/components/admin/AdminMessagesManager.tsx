"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { AttachmentKind, MessageRow } from "@/lib/types";
import {
  SeenStatus,
  SendingStatus,
  SentStatus,
} from "@/components/chat/SeenStatus";
import {
  MediaLightbox,
  type LightboxMedia,
} from "@/components/chat/MediaLightbox";
import { messagePreview } from "@/lib/products";

interface Thread {
  email: string;
  name: string | null;
  lastAt: string;
  preview: string;
  unread: number;
  lastSender: "user" | "admin";
}

interface PendingAttachment {
  file: File;
  previewUrl: string;
  type: AttachmentKind;
}

// Consistent pastel avatar tint per user.
const AVATAR_COLORS = [
  "from-[#c4a47c] to-[#8b6f4e]",
  "from-[#9b8ab3] to-[#5d4e7c]",
  "from-[#7d9aa8] to-[#4a6b7a]",
  "from-[#c28888] to-[#845050]",
  "from-[#b09e79] to-[#736346]",
  "from-[#86a97e] to-[#4f6e48]",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarClass(seed: string): string {
  return AVATAR_COLORS[hashStr(seed) % AVATAR_COLORS.length];
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s.@]+/).filter(Boolean);
  if (parts.length === 0) return "•";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "•";
}

function formatTimeShort(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const min = diffMs / 60000;
  if (min < 1) return "now";
  if (min < 60) return `${Math.floor(min)}m`;
  const hr = min / 60;
  if (hr < 24 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (hr < 24 * 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDayHeader(iso: string, now: Date): string {
  const d = new Date(iso);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function AdminMessagesManager() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasReadColumn, setHasReadColumn] = useState(true);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchAll = useCallback(async (): Promise<MessageRow[]> => {
    const supabase = createClient();
    const full =
      "id, user_email, user_name, message, sender, read_at, attachment_url, attachment_type, attachment_name, created_at";
    let { data, error } = await supabase
      .from("messages")
      .select(full)
      .order("created_at", { ascending: false });

    // Progressive fallbacks for installs that haven't run the attachment migration.
    if (
      error &&
      (error.message?.includes("attachment") ||
        error.message?.includes("user_name") ||
        error.message?.includes("read_at"))
    ) {
      const mid = await supabase
        .from("messages")
        .select("id, user_email, user_name, message, sender, read_at, created_at")
        .order("created_at", { ascending: false });
      data = mid.data as typeof data;
      error = mid.error ?? null;
    }
    if (
      error &&
      (error.message?.includes("user_name") || error.message?.includes("read_at"))
    ) {
      setHasReadColumn(false);
      const fallback = await supabase
        .from("messages")
        .select("id, user_email, message, sender, created_at")
        .order("created_at", { ascending: false });
      data = fallback.data as typeof data;
      error = fallback.error ?? null;
    }
    if (error || !data) return [];
    return data as MessageRow[];
  }, []);

  const buildThreads = useCallback((rows: MessageRow[]): Thread[] => {
    const byEmail = new Map<string, MessageRow[]>();
    rows.forEach((m) => {
      const list = byEmail.get(m.user_email) ?? [];
      list.push(m);
      byEmail.set(m.user_email, list);
    });
    const built: Thread[] = [];
    byEmail.forEach((msgs, email) => {
      const sorted = [...msgs].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const last = sorted[sorted.length - 1];
      const firstWithName = msgs.find((m) => m.user_name && m.sender === "user");
      const unread = msgs.filter((m) => m.sender === "user" && !m.read_at).length;
      built.push({
        email,
        name: firstWithName?.user_name ?? null,
        lastAt: last.created_at,
        preview: messagePreview(last),
        unread,
        lastSender: last.sender,
      });
    });
    built.sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );
    return built;
  }, []);

  const markThreadRead = useCallback(
    async (email: string) => {
      if (!hasReadColumn) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("user_email", email)
        .eq("sender", "user")
        .is("read_at", null);
      if (error && error.message?.includes("read_at")) {
        setHasReadColumn(false);
      }
    },
    [hasReadColumn]
  );

  const refresh = useCallback(async () => {
    const rows = await fetchAll();
    setThreads(buildThreads(rows));
    setLoading(false);
    if (activeEmail) {
      const thread = rows
        .filter((m) => m.user_email === activeEmail)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      setMessages(thread);
      if (thread.some((m) => m.sender === "user" && !m.read_at)) {
        void markThreadRead(activeEmail);
      }
    }
  }, [fetchAll, buildThreads, activeEmail, markThreadRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeEmail) {
      void markThreadRead(activeEmail);
      setShowListOnMobile(false);
    }
  }, [activeEmail, markThreadRead]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-messages-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void refresh();
        }
      )
      .subscribe();

    const poll = setInterval(() => void refresh(), 4000);

    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  function onPickAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      return;
    }
    const type: AttachmentKind = file.type.startsWith("video/") ? "video" : "image";
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending({ file, type, previewUrl: URL.createObjectURL(file) });
  }

  function removePending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }

  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  async function uploadPending(): Promise<{
    url: string;
    type: AttachmentKind;
    name: string;
  } | null> {
    if (!pending) return null;
    const form = new FormData();
    form.append("files", pending.file);
    form.append("kind", pending.type);
    setUploading(true);
    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await res.json()) as {
        files?: { url: string }[];
        error?: string;
      };
      const url = data.files?.[0]?.url;
      if (!res.ok || !url) throw new Error(data.error || "Upload failed");
      return { url, type: pending.type, name: pending.file.name };
    } finally {
      setUploading(false);
    }
  }

  async function sendReply(e?: React.FormEvent) {
    e?.preventDefault();
    if (!activeEmail) return;
    const body = reply.trim();
    if (!body && !pending) return;

    const tmpId = `tmp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tmpId,
      user_email: activeEmail,
      message: body || null,
      sender: "admin",
      read_at: null,
      attachment_url: pending?.previewUrl ?? null,
      attachment_type: pending?.type ?? null,
      attachment_name: pending?.file.name ?? null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setReply("");
    setSending(true);
    replyRef.current?.focus();

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
        user_email: activeEmail,
        message: body || null,
        sender: "admin",
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_name: attachment?.name ?? null,
      };

      let res = await supabase.from("messages").insert(payload);
      while (
        res.error &&
        /attachment_url|attachment_type|attachment_name/.test(res.error.message)
      ) {
        if (res.error.message.includes("attachment_url")) delete payload.attachment_url;
        else if (res.error.message.includes("attachment_type")) delete payload.attachment_type;
        else if (res.error.message.includes("attachment_name")) delete payload.attachment_name;
        else break;
        res = await supabase.from("messages").insert(payload);
      }
      if (res.error) throw res.error;
      await refresh();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
    } finally {
      setSending(false);
    }
  }

  const activeThread = threads.find((t) => t.email === activeEmail);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === "unread") {
      list = list.filter((t) => t.unread > 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.email.toLowerCase().includes(q) ||
          (t.name ?? "").toLowerCase().includes(q) ||
          t.preview.toLowerCase().includes(q)
      );
    }
    return list;
  }, [threads, filter, query]);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  // Group messages by day for separators.
  const messageGroups = useMemo(() => {
    const groups: { day: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const day = formatDayHeader(m.created_at, now);
      const existing = groups[groups.length - 1];
      if (existing && existing.day === day) existing.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [messages, now]);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Inbox</h1>
          <p className="mt-1 text-sm text-white/45">
            {totalUnread > 0
              ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}`
              : "All caught up."}
          </p>
        </div>
      </div>

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden rounded-sm border border-white/10 bg-zinc-950/60 md:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr]">
        {/* ---------- Thread list ---------- */}
        <aside
          className={`flex min-h-0 flex-col border-white/10 md:border-r ${
            showListOnMobile || !activeEmail ? "flex" : "hidden md:flex"
          }`}
        >
          <div className="space-y-3 border-b border-white/10 p-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-full border border-white/10 bg-black px-4 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-gold-400/50"
            />
            <div className="flex gap-1.5 text-[10px] uppercase tracking-[0.18em]">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-full px-3 py-1 transition ${
                  filter === "all"
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/55 hover:bg-white/10"
                }`}
              >
                All · {threads.length}
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`rounded-full px-3 py-1 transition ${
                  filter === "unread"
                    ? "bg-gold-400 text-black"
                    : "bg-white/5 text-white/55 hover:bg-white/10"
                }`}
              >
                Unread · {totalUnread}
              </button>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <li className="px-4 py-6 text-sm text-white/40">Loading…</li>
            ) : filteredThreads.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-white/40">
                {query || filter === "unread"
                  ? "No matching conversations."
                  : "No messages yet."}
              </li>
            ) : (
              filteredThreads.map((t) => {
                const active = t.email === activeEmail;
                const unread = t.unread > 0;
                return (
                  <li key={t.email}>
                    <button
                      type="button"
                      onClick={() => setActiveEmail(t.email)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                        active
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="relative flex-shrink-0">
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-inner ${avatarClass(
                            t.email
                          )}`}
                        >
                          {initials(t.name, t.email)}
                        </span>
                        {unread ? (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-400 px-1 text-[9px] font-bold text-black ring-2 ring-zinc-950">
                            {t.unread > 9 ? "9+" : t.unread}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm ${
                              unread ? "font-semibold text-white" : "text-white/85"
                            }`}
                          >
                            {t.name ?? t.email}
                          </span>
                          <span className="flex-shrink-0 text-[10px] text-white/40">
                            {formatTimeShort(t.lastAt, now)}
                          </span>
                        </span>
                        <span
                          className={`mt-0.5 line-clamp-1 block text-xs ${
                            unread ? "text-white/80" : "text-white/45"
                          }`}
                        >
                          {t.lastSender === "admin" ? (
                            <span className="text-white/35">You: </span>
                          ) : null}
                          {t.preview}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* ---------- Conversation ---------- */}
        <section
          className={`flex min-h-0 flex-col ${
            !showListOnMobile || activeEmail ? "flex" : "hidden md:flex"
          }`}
        >
          {!activeEmail ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 text-2xl text-white/40">
                ✉
              </span>
              <p className="mt-5 font-display text-xl text-white">
                Your inbox
              </p>
              <p className="mt-2 max-w-sm text-sm text-white/45">
                Select a conversation to reply. New messages from the storefront
                widget land here in real time.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowListOnMobile(true)}
                  className="mr-1 text-white/50 transition hover:text-white md:hidden"
                  aria-label="Back to inbox"
                >
                  ←
                </button>
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${avatarClass(
                    activeEmail
                  )}`}
                >
                  {initials(activeThread?.name ?? null, activeEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {activeThread?.name ?? activeEmail}
                  </p>
                  {activeThread?.name ? (
                    <p className="truncate text-[10px] uppercase tracking-[0.15em] text-white/40">
                      {activeEmail}
                    </p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                      Active conversation
                    </p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
                {messageGroups.map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-white/30">
                      <span className="h-px flex-1 bg-white/10" />
                      <span>{group.day}</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    {(() => {
                      const ownMessages = group.items.filter(
                        (m) => m.sender === "admin"
                      );
                      const lastOwn = ownMessages[ownMessages.length - 1];
                      const lastReadOwn = [...ownMessages]
                        .reverse()
                        .find((m) => m.read_at);

                      return group.items.map((m, i) => {
                        const isOwn = m.sender === "admin";
                        const prev = group.items[i - 1];
                        const next = group.items[i + 1];
                        const startOfGroup = !prev || prev.sender !== m.sender;
                        const endOfGroup = !next || next.sender !== m.sender;
                        const isPending =
                          isOwn &&
                          typeof m.id === "string" &&
                          m.id.startsWith("tmp-");
                        const showSeen =
                          isOwn && !!m.read_at && m.id === lastReadOwn?.id;
                        const showSent =
                          isOwn && !isPending && !m.read_at && m.id === lastOwn?.id;

                        const radius = isOwn
                          ? `rounded-2xl ${startOfGroup ? "rounded-tr-md" : ""} ${
                              endOfGroup ? "rounded-br-md" : ""
                            }`
                          : `rounded-2xl ${startOfGroup ? "rounded-tl-md" : ""} ${
                              endOfGroup ? "rounded-bl-md" : ""
                            }`;

                        const hasAttachment =
                          m.attachment_url && m.attachment_type;
                        const hasText = Boolean(m.message && m.message.trim());

                        return (
                          <motion.div
                            key={m.id}
                            layout
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            className={`flex flex-col gap-1 ${
                              isOwn ? "items-end" : "items-start"
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
                                className={`group block max-w-[70%] overflow-hidden rounded-2xl border transition ${
                                  isOwn
                                    ? "border-gold-400/30 hover:border-gold-300"
                                    : "border-white/10 hover:border-white/25"
                                }`}
                              >
                                {m.attachment_type === "image" ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={m.attachment_url!}
                                    alt={m.attachment_name ?? ""}
                                    className="max-h-[320px] w-auto object-cover transition group-hover:opacity-95"
                                  />
                                ) : (
                                  <video
                                    src={m.attachment_url!}
                                    className="max-h-[320px] w-auto"
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
                                className={`max-w-[78%] px-3.5 py-2 text-sm leading-relaxed ${radius} ${
                                  isOwn
                                    ? "bg-gradient-to-br from-gold-400 to-gold-500 text-black"
                                    : "bg-white/[0.08] text-white/90"
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
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={(e) => void sendReply(e)}
                className="border-t border-white/10 bg-black/30 p-3"
              >
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
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-2 transition focus-within:border-gold-400/50">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition hover:text-white disabled:opacity-40"
                    aria-label="Attach photo or video"
                    title="Attach photo or video"
                  >
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
                    accept="image/*,video/mp4,video/quicktime,video/webm"
                    onChange={onPickAttachment}
                    className="hidden"
                  />
                  <textarea
                    ref={replyRef}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    placeholder={pending ? "Add a caption…" : "Message…"}
                    rows={1}
                    className="max-h-24 flex-1 resize-none bg-transparent text-sm text-white placeholder-white/35 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || uploading || (!reply.trim() && !pending)}
                    className="rounded-full bg-gold-400 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-gold-300 disabled:opacity-30"
                  >
                    {uploading ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className="mt-1.5 px-2 text-[10px] text-white/25">
                  Enter to send · Shift + Enter for new line · paperclip to attach
                </p>
              </form>
            </>
          )}
        </section>
      </div>

      <AnimatePresence />
      <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
