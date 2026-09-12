// Lightweight per-client rate limiter shared by the credential-verification
// endpoints. State lives in a module-level Map that is per-instance and resets
// on cold start. That's acceptable here: Netlify function instances are
// short-lived, and the goal is only to blunt rapid brute-force bursts against
// the token/key oracles — not to enforce a durable, cross-instance quota. If we
// ever need that, swap the Map for a Netlify Blobs counter (see tokens.js).

// A bucket records the window it was written under so the eviction sweep can
// judge every key by its own window. One Map is shared by endpoints whose
// windows differ by 60x (see rateLimitPolicy), so a sweep that reused the
// calling endpoint's cutoff would evict an hour-long bucket after a minute —
// silently resetting that endpoint's budget.
interface Bucket {
  hits: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

// The sweep is an eviction heuristic, not a limiter rule: scanning the whole Map
// is only worth it once it holds enough distinct clients to threaten memory.
// Exported so rateLimit.test.ts can fill the Map to the sweep threshold without
// restating the number.
export const SWEEP_BUCKET_THRESHOLD = 5000;

export interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}

function liveHits(key: string, now: number, windowMs: number): number[] {
  const bucket = buckets.get(key);
  if (!bucket) return [];
  return bucket.hits.filter((t) => t > now - windowMs);
}

function limitedBy(hits: number[], now: number, windowMs: number): RateLimitResult {
  return { limited: true, retryAfter: Math.max(Math.ceil((hits[0] + windowMs - now) / 1000), 1) };
}

// Opportunistic eviction so the Map can't grow unbounded across many distinct
// clients; only runs once the Map is already large.
function sweepExpiredBuckets(now: number): void {
  if (buckets.size <= SWEEP_BUCKET_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    const newest = bucket.hits[bucket.hits.length - 1];
    if (newest === undefined || newest <= now - bucket.windowMs) buckets.delete(key);
  }
}

/**
 * Sliding-window limiter. Reports whether `key` has already used its `limit`
 * hits within the trailing `windowMs`, and records a hit only when allowed —
 * rejected attempts don't extend the window, so a client that waits out
 * `retryAfter` is genuinely unblocked.
 *
 * Returns `{ limited, retryAfter }` — `retryAfter` is seconds until the oldest
 * hit in the window ages out (only meaningful when `limited` is true).
 */
export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  const hits = liveHits(key, now, windowMs);

  sweepExpiredBuckets(now);

  if (hits.length >= limit) {
    buckets.set(key, { hits, windowMs });
    return limitedBy(hits, now, windowMs);
  }

  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return { limited: false, retryAfter: 0 };
}

/**
 * Read-only check: reports whether `key` is currently limited without
 * recording a hit. For endpoints that throttle only their failure path —
 * peek before the credential check (a limited caller gets a blind 429 with
 * no oracle answer), then call `rateLimit` to record a hit only when the
 * check fails, so legitimate callers never consume the budget.
 */
export function peekRateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  const hits = liveHits(key, now, windowMs);
  if (hits.length < limit) return { limited: false, retryAfter: 0 };
  return limitedBy(hits, now, windowMs);
}
