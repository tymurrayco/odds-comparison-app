// src/lib/rateLimit.ts
//
// Small per-IP sliding-window limiter for routes that spend Odds API credits
// per hit (props: 5–17 credits per event). In-memory, so it is PER LAMBDA
// INSTANCE: a visitor bouncing between warm instances gets a little more
// than the nominal allowance, which is fine — the goal is to stop a script
// looping every event, not to meter honest users. Admin requests (cookie)
// are exempt by the caller.

interface Bucket { hits: number[] }

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Client IP as Vercel presents it (first x-forwarded-for hop), else 'unknown'. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest hit in the window ages out (for Retry-After). */
  retryAfterSec: number;
}

/**
 * Record one hit for `key` and say whether it is within `limit` hits per
 * `windowMs`. Hits are counted even when refused, so a hammering script keeps
 * getting refused.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const since = now - windowMs;

  // Occasional sweep so idle keys don't pile up for the life of the instance
  if (now - lastSweep > windowMs) {
    for (const [k, b] of buckets) {
      b.hits = b.hits.filter((t) => t > since);
      if (b.hits.length === 0) buckets.delete(k);
    }
    lastSweep = now;
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > since);
  const allowed = bucket.hits.length < limit;
  bucket.hits.push(now);
  buckets.set(key, bucket);

  const oldest = bucket.hits[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
  };
}
