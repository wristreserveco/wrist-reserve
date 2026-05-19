"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_VID = "wr_analytics_vid";
const STORAGE_SID = "wr_analytics_sid";
const STORAGE_SLAST = "wr_analytics_slast";
const SESSION_IDLE_MS = 45 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomUuid(): string {
  return crypto.randomUUID();
}

function readVisitorId(): string {
  try {
    let v = localStorage.getItem(STORAGE_VID);
    if (!v || !UUID_RE.test(v)) {
      v = randomUuid();
      localStorage.setItem(STORAGE_VID, v);
    }
    return v;
  } catch {
    return randomUuid();
  }
}

function touchSessionClock(): void {
  try {
    sessionStorage.setItem(STORAGE_SLAST, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function readSessionId(): string {
  const now = Date.now();
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(STORAGE_SLAST) || 0);
  } catch {
    last = 0;
  }
  let sid: string | null = null;
  try {
    sid = sessionStorage.getItem(STORAGE_SID);
  } catch {
    sid = null;
  }
  if (!sid || !UUID_RE.test(sid) || now - last > SESSION_IDLE_MS) {
    sid = randomUuid();
    try {
      sessionStorage.setItem(STORAGE_SID, sid);
      sessionStorage.setItem(STORAGE_SLAST, String(now));
    } catch {
      /* ignore */
    }
    return sid;
  }
  return sid;
}

function utmFrom(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const v = sp.get(key);
    if (v) out[key] = v;
  }
  return out;
}

async function send(payload: Record<string, unknown>) {
  try {
    await fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* non-blocking */
  }
}

/**
 * Lightweight first-party analytics for the storefront (skipped on /admin).
 * Tracks landing + acquisition, per-page dwell (navigation-based), and
 * active tab pulses for time-on-site between navigations.
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevKeyRef = useRef<string | null>(null);
  const pathEnteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const visitorId = readVisitorId();
    const sessionId = readSessionId();
    const query = searchParams.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    const now = Date.now();

    const dwellMs =
      prevKeyRef.current != null
        ? Math.min(3_600_000, Math.max(0, now - pathEnteredAtRef.current))
        : 0;

    const isFirst = prevKeyRef.current === null;

    void (async () => {
      if (isFirst) {
        await send({
          type: "session_boot",
          visitorId,
          sessionId,
          path: pathname,
          query,
          referrer:
            typeof document !== "undefined" ? document.referrer.slice(0, 2048) : "",
          utm: utmFrom(searchParams),
          viewport: {
            w: typeof window !== "undefined" ? window.innerWidth : undefined,
            h: typeof window !== "undefined" ? window.innerHeight : undefined,
          },
          language: typeof navigator !== "undefined" ? navigator.language : undefined,
          timezone:
            typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : undefined,
        });
      }

      await send({
        type: "pageview",
        visitorId,
        sessionId,
        path: pathname,
        query,
        title: typeof document !== "undefined" ? document.title.slice(0, 512) : "",
        referrer:
          typeof document !== "undefined" ? document.referrer.slice(0, 2048) : "",
        utm: utmFrom(searchParams),
        dwellMs: isFirst ? 0 : dwellMs,
        viewport: {
          w: typeof window !== "undefined" ? window.innerWidth : undefined,
          h: typeof window !== "undefined" ? window.innerHeight : undefined,
        },
        language: typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone:
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
      });
      touchSessionClock();
    })();

    prevKeyRef.current = fullPath;
    pathEnteredAtRef.current = Date.now();
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const pulseMs = 20_000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const visitorId = readVisitorId();
      const sessionId = readSessionId();
      void send({
        type: "pulse",
        visitorId,
        sessionId,
        pulseMs,
      });
      touchSessionClock();
    }, pulseMs);

    const onHide = () => {
      const visitorId = readVisitorId();
      const sessionId = readSessionId();
      const payload = JSON.stringify({
        type: "pulse",
        visitorId,
        sessionId,
        pulseMs: 5000,
      });
      try {
        navigator.sendBeacon(
          "/api/analytics/collect",
          new Blob([payload], { type: "application/json" })
        );
      } catch {
        void send({ type: "pulse", visitorId, sessionId, pulseMs: 5000 });
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });

    return () => {
      window.clearInterval(id);
    };
  }, [pathname]);

  return null;
}
