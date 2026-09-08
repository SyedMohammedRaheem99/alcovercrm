/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately not Redis: this project must run entirely on free tiers. The
 * trade-off is that each serverless instance keeps its own counter, so the
 * effective limit is per-instance rather than global. That is still an effective
 * brake on credential stuffing, and the per-account lockout in the login route
 * (stored in MongoDB, therefore global) is the real protection against targeted
 * attacks on one account.
 */

interface Bucket {
  hits: number[];
  blockedUntil?: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number, windowMs: number) {
  // Bound memory: drop expired entries, and if still oversized, clear the oldest.
  for (const [key, bucket] of buckets) {
    const fresh = bucket.hits.filter((t) => now - t < windowMs);
    if (fresh.length === 0 && (!bucket.blockedUntil || bucket.blockedUntil < now)) {
      buckets.delete(key);
    } else {
      bucket.hits = fresh;
    }
  }
  if (buckets.size > MAX_TRACKED_KEYS) {
    const excess = buckets.size - MAX_TRACKED_KEYS;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= excess) break;
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs, blockMs = 0 }: { limit: number; windowMs: number; blockMs?: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };

  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    if (blockMs > 0) bucket.blockedUntil = now + blockMs;
    buckets.set(key, bucket);
    const retryMs = blockMs > 0 ? blockMs : windowMs - (now - bucket.hits[0]);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryMs / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/** Clear a key after a successful login so one bad typo does not linger. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Best-effort client IP. Vercel sets `x-forwarded-for`; the first entry is the
 * real client. Never trust this for authorisation — only for coarse throttling.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
