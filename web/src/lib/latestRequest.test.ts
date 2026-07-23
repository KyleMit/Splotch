import { describe, expect, it } from 'vitest';
import { createLatestRequest } from './latestRequest';

describe('createLatestRequest', () => {
  it('marks a fresh request as current', () => {
    const latest = createLatestRequest();
    const { id } = latest.begin();
    expect(latest.isCurrent(id)).toBe(true);
  });

  it('makes the previous request stale and aborts its signal when a new one begins', () => {
    const latest = createLatestRequest();
    const first = latest.begin();
    expect(first.signal.aborted).toBe(false);

    const second = latest.begin();

    expect(latest.isCurrent(first.id)).toBe(false);
    expect(first.signal.aborted).toBe(true);
    expect(latest.isCurrent(second.id)).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('hands out monotonically increasing ids', () => {
    const latest = createLatestRequest();
    const a = latest.begin();
    const b = latest.begin();
    const c = latest.begin();
    expect(b.id).toBeGreaterThan(a.id);
    expect(c.id).toBeGreaterThan(b.id);
  });
});
