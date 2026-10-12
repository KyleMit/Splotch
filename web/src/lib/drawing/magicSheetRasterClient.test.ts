import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MagicSheetWorkerRequest, MagicSheetWorkerRequestPayload } from './magicSheet.worker';

vi.mock('./perf', () => ({ PERF_MARKS: true }));
const workers: RasterWorker[] = [];
let retryPostError: Error | null = null;
class RasterWorker {
  posted: MagicSheetWorkerRequest[] = [];
  terminate = vi.fn();
  postError = workers.length > 0 ? retryPostError : null;
  constructor() {
    workers.push(this);
  }
  addEventListener() {}
  postMessage(message: MagicSheetWorkerRequest) {
    if (this.postError) throw this.postError;
    this.posted.push(message);
  }
}
const request: MagicSheetWorkerRequestPayload = {
  width: 400,
  height: 300,
  imageUrl: '/page.light.webp',
  fit: { x: 0, y: 0, width: 400, height: 300 },
  edgeFills: [],
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  workers.length = 0;
  retryPostError = null;
  vi.stubGlobal('Worker', RasterWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function twoPendingRequests() {
  const client = await import('./magicSheetRasterClient');
  const { magicWorkCounters } = await import('./magicWorkDebug');
  const first = client.rasterizeMagicSheetInWorker(request).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(14_000);
  const second = client.rasterizeMagicSheetInWorker(request).catch((error: unknown) => error);
  return { client, first, second, counts: () => magicWorkCounters?.snapshot() };
}

it('retains the newer request identity and original deadline after an older timeout', async () => {
  const fixture = await twoPendingRequests();
  const originalId = workers[0].posted[1].id;
  await vi.advanceTimersByTimeAsync(1_000);
  await expect(fixture.first).resolves.toBeInstanceOf(Error);
  expect(workers[1].posted[0]).toEqual({ ...request, id: originalId });
  expect(fixture.client.getMagicWorkerState()).toMatchObject({
    magicWorkerPending: 1,
    magicWorkerNextRequestId: 2,
  });
  await vi.advanceTimersByTimeAsync(13_999);
  expect(fixture.client.getMagicWorkerState()?.magicWorkerPending).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(fixture.second).resolves.toBeInstanceOf(Error);
  expect(fixture.client.getMagicWorkerState()?.magicWorkerPending).toBe(0);
  expect(fixture.counts()).toMatchObject({
    magicWorkerRequests: 2,
    magicWorkerAcquisitions: 3,
    magicWorkerConstructed: 2,
    magicInitialPosts: 2,
    magicRetryPosts: 1,
    magicRejectedRequests: 2,
    magicResolvedRequests: 0,
    magicWorkerRetirements: 2,
    magicWorkerFailures: { timeout: 2, 'retry-post': 0 },
  });
});

it('counts a thrown retry post separately without inventing another logical request', async () => {
  const fixture = await twoPendingRequests();
  const error = new Error('Retry post failed');
  retryPostError = error;
  await vi.advanceTimersByTimeAsync(1_000);
  await expect(fixture.second).resolves.toBe(error);
  expect(fixture.client.getMagicWorkerState()).toMatchObject({
    magicWorkerPending: 0,
    magicWorkerExists: false,
  });
  expect(fixture.counts()).toMatchObject({
    magicWorkerRequests: 2,
    magicWorkerConstructed: 2,
    magicInitialPosts: 2,
    magicRetryPosts: 1,
    magicRejectedRequests: 2,
    magicWorkerRetirements: 2,
    magicWorkerFailures: { timeout: 1, 'retry-post': 1, 'initial-post': 0 },
  });
});
