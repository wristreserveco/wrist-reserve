"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function formatRelative(from: Date, now: Date): string {
  const diffMs = now.getTime() - from.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  return `${week}w ago`;
}

interface SeenStatusProps {
  readAt: string;
  align?: "left" | "right";
}

export function SeenStatus({ readAt, align = "right" }: SeenStatusProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const when = new Date(readAt);
  const relative = formatRelative(when, now);

  return (
    <motion.span
      key="seen"
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`mt-1 text-[10px] tracking-wide text-white/45 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      Seen {relative}
    </motion.span>
  );
}

export function SendingStatus({ align = "right" }: { align?: "left" | "right" }) {
  return (
    <span
      className={`mt-1 text-[10px] tracking-wide text-white/30 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      Sending…
    </span>
  );
}

export function SentStatus({ align = "right" }: { align?: "left" | "right" }) {
  return (
    <motion.span
      key="sent"
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`mt-1 text-[10px] tracking-wide text-white/40 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      Sent
    </motion.span>
  );
}
