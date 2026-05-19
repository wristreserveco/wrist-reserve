/**
 * Pluggable rate limiter.
 *
 * Two backends, picked automatically based on env:
 *
 *   1. Upstash Redis (production-grade, free tier covers ~10k req/day).
 *      Activates when both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *      are present. This is the only mode that works correctly across
 *      Vercel's distributed serverless instances.
 *
 *   2. In-memory LRU (fallback). Works fine for a single instance and
 *      degrades safely on Vercel — each lambda gets its own counter, so an
 *      attacker can still get rate-limit-per-instance throughput, but
 *      casual brute force still gets stopped. Safer than no limit at all.
 *
 * Usage:
 *   const result = await rateLimit({
 *     key: `paypal:${clientIp}`,
 *     limit: 10,
 *     windowSec: 60,
 *   });
 *   if (!result.allowed) return new Response("Too many requests", { status: 429 });
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Bucket = { count: number; resetAt: number };

const memoryStore = new Map<string, Bucket>();

let upstashLimiter: Ratelimit | null = null;

function getUpstashLimiter(limit: number, windowSec: number): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  // Cache the client/limiter once per cold start. Different limits/windows
  // each call would normally need a different limiter instance, but
  // Ratelimit.slidingWindow accepts both as args so we re-instantiate when
  // either changes — cheap because the underlying Redis client is reused.
  const redis = Redis.fromEnv();
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: false,
    prefix: "wr:rl",
  });
}

export interface RateLimitArgs {
  /** Unique key — usually `<purpose>:<ip-or-user>`. Keep it stable. */
  key: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Sliding window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  backend: "upstash" | "memory" | "disabled";
}

export async function rateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const { key, limit, windowSec } = args;

  // ─── Upstash backend ────────────────────────────────────────────────
  const upstash = getUpstashLimiter(limit, windowSec);
  if (upstash) {
    upstashLimiter = upstash;
    try {
      const res = await upstashLimiter.limit(key);
      return {
        allowed: res.success,
        remaining: res.remaining,
        resetAt: res.reset,
        backend: "upstash",
      };
    } catch (e) {
      // If Upstash itself errors, fall through to memory rather than blocking
      // legitimate traffic on a backend outage.
      console.error("[rate-limit] upstash failure, falling back to memory:", e);
    }
  }

  // ─── In-memory backend ──────────────────────────────────────────────
  const now = Date.now();
  const resetAt = now + windowSec * 1000;
  const bucket = memoryStore.get(key);
  if (!bucket || bucket.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
      backend: "memory",
    };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    backend: "memory",
  };
}

/**
 * Extract the best-effort client IP from a Next.js Request.
 * Vercel sets `x-forwarded-for` (comma-separated, first hop is the client).
 * Cloudflare adds `cf-connecting-ip` when fronting the site.
 */
export function clientIpFromRequest(req: Request): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Convenience: enforce a rate limit and return a NextResponse 429 if blocked.
 * Returns null when the request should proceed.
 */
export function tooManyResponse(result: RateLimitResult): Response | null {
  if (result.allowed) return null;
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: "Too many requests. Slow down and try again shortly.",
      retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    }
  );
}
