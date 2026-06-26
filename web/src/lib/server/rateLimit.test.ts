import { describe, it, expect, afterEach, vi } from 'vitest';
import { rateLimit } from './rateLimit';

// The limiter keeps state in a module-level Map keyed by the caller-supplied
// string, so each test uses a distinct key to stay independent of the others.

describe('rateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows hits up to the limit, then blocks the next one', () => {
    const key = 'allow-then-block';
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, { limit: 3 }).limited).toBe(false);
    }
    expect(rateLimit(key, { limit: 3 }).limited).toBe(true);
  });

  it('reports a retryAfter of at least one second once limited', () => {
    const key = 'retry-after';
    rateLimit(key, { limit: 1 });
    const result = rateLimit(key, { limit: 1 });
    expect(result.limited).toBe(true);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('lets requests through again once the window slides past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const key = 'sliding-window';
    for (let i = 0; i < 3; i++) rateLimit(key, { limit: 3, windowMs: 1000 });
    expect(rateLimit(key, { limit: 3, windowMs: 1000 }).limited).toBe(true);

    // Advance past the window so every recorded hit ages out.
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, { limit: 3, windowMs: 1000 }).limited).toBe(false);
  });

  it('tracks each key independently', () => {
    expect(rateLimit('key-a', { limit: 1 }).limited).toBe(false);
    expect(rateLimit('key-a', { limit: 1 }).limited).toBe(true);
    // A different key has its own budget and is unaffected.
    expect(rateLimit('key-b', { limit: 1 }).limited).toBe(false);
  });
});
