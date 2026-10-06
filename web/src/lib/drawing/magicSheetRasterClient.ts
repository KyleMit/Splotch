import { promiseWithResolvers } from '../promiseWithResolvers';
import type { MagicSheetWorkerRequestPayload, MagicSheetWorkerResponse } from './magicSheet.worker';
import { magicWorkCounters } from './magicWorkDebug';
import { PERF_MARKS } from './perf';

interface PendingWorkerRaster {
  resolve: (bitmap: ImageBitmap) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  worker: Worker;
  request: MagicSheetWorkerRequestPayload;
}

const MAGIC_SHEET_WORKER_TIMEOUT_MS = 15_000;
let rasterWorker: Worker | null = null;
let nextRasterRequestId = 0;
const pendingWorkerRasters = new Map<number, PendingWorkerRaster>();

export function magicSheetWorkerSupported() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}

function rejectWorkerRasters(worker: Worker, error: Error) {
  for (const [id, request] of pendingWorkerRasters) {
    if (request.worker !== worker) continue;
    clearTimeout(request.timeoutId);
    if (PERF_MARKS) magicWorkCounters?.recordWorkerRejection();
    request.reject(error);
    pendingWorkerRasters.delete(id);
  }
}

function failRasterWorker(worker: Worker, error: Error) {
  worker.terminate();
  if (PERF_MARKS) magicWorkCounters?.recordWorkerRetirement();
  rejectWorkerRasters(worker, error);
  if (rasterWorker === worker) rasterWorker = null;
}

function postRetriedWorkerRasters(worker: Worker, pending: Array<[number, PendingWorkerRaster]>) {
  const start = PERF_MARKS ? performance.now() : 0;
  try {
    for (const [, request] of pending) request.worker = worker;
    for (const [id, request] of pending) {
      if (PERF_MARKS) magicWorkCounters?.recordWorkerPost('retry');
      worker.postMessage({ ...request.request, id });
    }
  } catch (error) {
    if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('retry-post');
    throw error;
  } finally {
    if (PERF_MARKS) performance.measure('magicWitness.workerRequest', { start });
  }
}

function redispatchWorkerRasters(failedWorker: Worker) {
  const pending = [...pendingWorkerRasters].filter(
    ([, request]) => request.worker === failedWorker
  );
  if (pending.length === 0) return;

  let worker: Worker | null = null;
  try {
    worker = magicSheetRasterWorker();
    postRetriedWorkerRasters(worker, pending);
  } catch (error) {
    if (worker) {
      failRasterWorker(worker, error instanceof Error ? error : new Error(String(error)));
    } else {
      for (const [, request] of pending) {
        clearTimeout(request.timeoutId);
        if (PERF_MARKS) magicWorkCounters?.recordWorkerRejection();
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
      for (const [id] of pending) pendingWorkerRasters.delete(id);
    }
  }
}

function timeoutWorkerRaster(id: number) {
  const request = pendingWorkerRasters.get(id);
  if (!request) return;
  if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('timeout');
  pendingWorkerRasters.delete(id);
  if (PERF_MARKS) magicWorkCounters?.recordWorkerRejection();
  request.reject(new Error('Magic sheet worker timed out'));
  request.worker.terminate();
  if (PERF_MARKS) magicWorkCounters?.recordWorkerRetirement();
  if (rasterWorker === request.worker) rasterWorker = null;
  redispatchWorkerRasters(request.worker);
}

function magicSheetRasterWorker() {
  if (PERF_MARKS) magicWorkCounters?.recordWorkerAcquisition();
  if (rasterWorker) return rasterWorker;
  const start = PERF_MARKS ? performance.now() : 0;
  let stage: 'constructor' | 'listeners' = 'constructor';
  try {
    if (PERF_MARKS) magicWorkCounters?.recordWorkerConstructionAttempt();
    const worker = new Worker(new URL('./magicSheet.worker.ts', import.meta.url), {
      type: 'module',
    });
    stage = 'listeners';
    worker.addEventListener('message', ({ data }: MessageEvent<MagicSheetWorkerResponse>) => {
      const request = pendingWorkerRasters.get(data.id);
      if (!request || request.worker !== worker) {
        if ('bitmap' in data) {
          data.bitmap.close();
          if (PERF_MARKS) magicWorkCounters?.recordOrphanedReplyDisposal();
        }
        return;
      }
      if ('error' in data && data.code !== undefined) {
        if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('coded-reply');
        failRasterWorker(worker, new Error(data.error));
        return;
      }
      pendingWorkerRasters.delete(data.id);
      clearTimeout(request.timeoutId);
      if ('error' in data) {
        if (PERF_MARKS) {
          magicWorkCounters?.recordWorkerFailure('reply');
          magicWorkCounters?.recordWorkerRejection();
        }
        request.reject(new Error(data.error));
      } else {
        if (PERF_MARKS) magicWorkCounters?.recordWorkerResolution();
        request.resolve(data.bitmap);
      }
    });
    worker.addEventListener('error', (event) => {
      if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('error-event');
      failRasterWorker(worker, new Error(event.message || 'Magic sheet worker failed'));
    });
    worker.addEventListener('messageerror', () => {
      if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('messageerror');
      failRasterWorker(worker, new Error('Magic sheet worker response could not be decoded'));
    });
    rasterWorker = worker;
    if (PERF_MARKS) magicWorkCounters?.recordWorkerConstructed();
    return worker;
  } catch (error) {
    if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure(stage);
    throw error;
  } finally {
    if (PERF_MARKS) performance.measure('magicWitness.workerCreate', { start });
  }
}

export function rasterizeMagicSheetInWorker(request: MagicSheetWorkerRequestPayload) {
  if (PERF_MARKS) magicWorkCounters?.recordWorkerRequest();
  const id = ++nextRasterRequestId;
  const { promise, resolve, reject } = promiseWithResolvers<ImageBitmap>();
  let worker: Worker;
  try {
    worker = magicSheetRasterWorker();
  } catch (error) {
    if (PERF_MARKS) magicWorkCounters?.recordWorkerRejection();
    reject(error instanceof Error ? error : new Error(String(error)));
    return promise;
  }
  const start = PERF_MARKS ? performance.now() : 0;
  try {
    const timeoutId = setTimeout(() => timeoutWorkerRaster(id), MAGIC_SHEET_WORKER_TIMEOUT_MS);
    pendingWorkerRasters.set(id, { resolve, reject, timeoutId, worker, request });
    try {
      if (PERF_MARKS) magicWorkCounters?.recordWorkerPost('initial');
      worker.postMessage({ ...request, id });
    } catch (error) {
      if (PERF_MARKS) magicWorkCounters?.recordWorkerFailure('initial-post');
      failRasterWorker(worker, error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    if (PERF_MARKS) performance.measure('magicWitness.workerRequest', { start });
  }
  return promise;
}

export function getMagicWorkerState() {
  if (!PERF_MARKS) return null;
  return {
    magicWorkerSupported: magicSheetWorkerSupported(),
    magicWorkerExists: rasterWorker !== null,
    magicWorkerPending: pendingWorkerRasters.size,
    magicWorkerNextRequestId: nextRasterRequestId,
  };
}
