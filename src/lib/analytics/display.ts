/** Lightweight UA / referrer helpers for admin analytics (no extra deps). */

export type ParsedUa = {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop" | "unknown";
};

export function parseUserAgent(ua: string | null | undefined): ParsedUa {
  const s = (ua ?? "").toLowerCase();
  if (!s) {
    return { browser: "Unknown", os: "Unknown", device: "unknown" };
  }

  let device: ParsedUa["device"] = "desktop";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) {
    device = "tablet";
  } else if (
    /mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(s)
  ) {
    device = "mobile";
  }

  let browser = "Other";
  if (s.includes("edg/") || s.includes("edge/")) browser = "Edge";
  else if (s.includes("opr/") || s.includes("opera")) browser = "Opera";
  else if (s.includes("crios")) browser = "Chrome (iOS)";
  else if (s.includes("fxios")) browser = "Firefox (iOS)";
  else if (s.includes("chrome/") && !s.includes("chromium")) browser = "Chrome";
  else if (s.includes("safari/") && !s.includes("chrome")) browser = "Safari";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("instagram")) browser = "Instagram in-app";
  else if (s.includes("fbav") || s.includes("fban")) browser = "Facebook in-app";

  let os = "Other";
  if (s.includes("iphone") || s.includes("ipad") || s.includes("ipod")) os = "iOS";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("mac os x") || s.includes("macintosh")) os = "macOS";
  else if (s.includes("windows")) os = "Windows";
  else if (s.includes("linux")) os = "Linux";

  return { browser, os, device };
}

export function referrerLabel(referrer: string | null | undefined): string {
  const r = (referrer ?? "").trim();
  if (!r) return "Direct";
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return r.length > 48 ? `${r.slice(0, 48)}…` : r;
  }
}

export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function pathWithQuery(path: string | null, query: string | null): string {
  const p = path ?? "/";
  const q = (query ?? "").trim();
  if (!q) return p;
  return q.startsWith("?") ? `${p}${q}` : `${p}?${q}`;
}

export function isLiveSession(lastActivityAt: string, windowMinutes = 15): boolean {
  const t = new Date(lastActivityAt).getTime();
  return Date.now() - t <= windowMinutes * 60 * 1000;
}
