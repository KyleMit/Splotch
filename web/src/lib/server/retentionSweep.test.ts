// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RETENTION_SWEEP_CONCURRENCY, settleWithRetentionConcurrency } from './retentionSweep';

describe('settleWithRetentionConcurrency', () => {
  it('bounds concurrent work and keeps later items progressing after a rejection', async () => {
    const items = Array.from({ length: RETENTION_SWEEP_CONCURRENCY * 2 + 1 }, (_, index) => index);
    let active = 0;
    let peak = 0;

    const results = await settleWithRetentionConcurrency(items, async (item) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      if (item === 1) throw new Error('isolated failure');
      return item * 2;
    });

    expect(peak).toBe(RETENTION_SWEEP_CONCURRENCY);
    expect(results[1]).toMatchObject({ status: 'rejected' });
    expect(results.at(-1)).toEqual({ status: 'fulfilled', value: (items.length - 1) * 2 });
  });
});
