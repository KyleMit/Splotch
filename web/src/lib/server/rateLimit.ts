// Lightweight per-client rate limiter shared by the credential-verification
// endpoints. State lives in a module-level Map that is per-instance and resets
// on cold start. That's acceptable here: Netlify function instances are
// short-lived, and the goal is only to blunt rapid brute-force bursts against
// the token/key oracles — not to enforce a durable, cross-instance quota. If we
// ever need that, swap the Map for a Netlify Blobs counter (see tokens.js).

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}

/**
 * Sliding-window limiter. Records a hit for `key` and reports whether the caller
 * has now exceeded `limit` hits within the trailing `windowMs`.
 *
 * Returns `{ limited, retryAfter }` — `retryAfter` is seconds until the oldest
 * hit in the window ages out (only meaningful when `limited` is true).
 */
export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (buckets.get(key) || []).filter((t) => t > cutoff);
  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic sweep so the Map can't grow unbounded across many distinct
  // IPs; only runs once the map is already large.
  if (buckets.size > 5000) {
    for (const [k, ts] of buckets) {
      if (ts[ts.length - 1] <= cutoff) buckets.delete(k);
    }
  }

  if (hits.length > limit) {
    const retryAfter = Math.max(Math.ceil((hits[0] + windowMs - now) / 1000), 1);
    return { limited: true, retryAfter };
  }
  return { limited: false, retryAfter: 0 };
}
