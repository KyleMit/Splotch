import { describe, expect, it } from 'vitest';
import { createSingleFlight } from './singleFlight';

describe('createSingleFlight', () => {
  // The case an end-to-end test cannot reach: both callers arrive while the
  // producer is still pending. A memo that caches only the resolved value
  // starts a second run here, which is how ReportFields could send a device
  // snapshot its own preview never rendered.
  it('runs the producer once for callers that overlap in flight', async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    let runs = 0;
    const collect = createSingleFlight(() => {
      runs++;
      return promise;
    });

    const first = collect();
    const second = collect();
    expect(runs, 'a caller arriving mid-flight started its own run').toBe(1);

    resolve('snapshot');
    await expect(first).resolves.toBe('snapshot');
    await expect(second).resolves.toBe('snapshot');
    expect(runs).toBe(1);
  });

  it('reuses the settled run for later callers', async () => {
    let runs = 0;
    const collect = createSingleFlight(() => {
      runs++;
      return Promise.resolve(runs);
    });

    await expect(collect()).resolves.toBe(1);
    await expect(collect()).resolves.toBe(1);
    expect(runs).toBe(1);
  });

  it('clears the memo on rejection so a later caller retries', async () => {
    let runs = 0;
    const collect = createSingleFlight(() => {
      runs++;
      return runs === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('recovered');
    });

    await expect(collect()).rejects.toThrow('offline');
    await expect(collect()).resolves.toBe('recovered');
    expect(runs, 'a rejected run stayed memoized and blocked the retry').toBe(2);
  });

  it('shares one rejection with every caller already waiting on it', async () => {
    const { promise, reject } = Promise.withResolvers<string>();
    let runs = 0;
    const collect = createSingleFlight(() => {
      runs++;
      return promise;
    });

    const first = collect();
    const second = collect();
    reject(new Error('offline'));

    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    expect(runs).toBe(1);
  });
});
