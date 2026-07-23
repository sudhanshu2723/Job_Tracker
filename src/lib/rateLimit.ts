import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

// ── Upstash (production) ─────────────────────────────────────────────
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const limiterCache = new Map<string, Ratelimit>();
function getLimiter(limit: number, windowSec: number): Ratelimit | null {
  if (!redis) return null;
  const k = `${limit}:${windowSec}`;
  let rl = limiterCache.get(k);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: "jobtrack:rl",
      analytics: false,
    });
    limiterCache.set(k, rl);
  }
  return rl;
}

// ── In-memory fallback (local/dev/tests, single instance) ────────────
const memStore = new Map<string, number[]>();
function memLimit(key: string, limit: number, windowSec: number): RateResult {
  if (memStore.size > 5000) memStore.clear(); // crude memory bound
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const hits = (memStore.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = hits.length < limit;
  if (ok) hits.push(now);
  if (hits.length) memStore.set(key, hits);
  else memStore.delete(key);
  const resetMs = hits.length ? windowMs - (now - hits[0]) : windowMs;
  return { ok, remaining: Math.max(0, limit - hits.length), resetMs };
}

/** Core limiter: allow up to `limit` hits per `windowSec` for `key`. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateResult> {
  const rl = getLimiter(limit, windowSec);
  if (rl) {
    try {
      const r = await rl.limit(key);
      return { ok: r.success, remaining: r.remaining, resetMs: Math.max(0, r.reset - Date.now()) };
    } catch {
      // If Upstash is unreachable, fail open to a local check rather than 500.
      return memLimit(key, limit, windowSec);
    }
  }
  return memLimit(key, limit, windowSec);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Enforce a rate limit for a request. Returns a 429 NextResponse when exceeded,
 * or null to proceed. `extra` lets you scope per-user/email as well as per-IP.
 */
export async function enforceRateLimit(
  req: Request,
  name: string,
  limit: number,
  windowSec: number,
  extra?: string,
): Promise<NextResponse | null> {
  const key = `${name}:${clientIp(req)}${extra ? `:${extra}` : ""}`;
  const res = await rateLimit(key, limit, windowSec);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Too many requests — please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(res.resetMs / 1000)) } },
    );
  }
  return null;
}
