import { promiseWithResolvers } from '../promiseWithResolvers';
import type { MagicSheetWorkerRequestPayload, MagicSheetWorkerResponse } from './magicSheet.worker';

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
    request.reject(error);
    pendingWorkerRasters.delete(id);
  }
}

function failRasterWorker(worker: Worker, error: Error) {
  worker.terminate();
  rejectWorkerRasters(worker, error);
  if (rasterWorker === worker) rasterWorker = null;
}

function redispatchWorkerRasters(failedWorker: Worker) {
  const pending = [...pendingWorkerRasters].filter(
    ([, request]) => request.worker === failedWorker
  );
  if (pending.length === 0) return;

  let worker: Worker | null = null;
  try {
    worker = magicSheetRasterWorker();
    for (const [, request] of pending) request.worker = worker;
    for (const [id, request] of pending) worker.postMessage({ ...request.request, id });
  } catch (error) {
    if (worker) {
      failRasterWorker(worker, error instanceof Error ? error : new Error(String(error)));
    } else {
      for (const [, request] of pending) {
        clearTimeout(request.timeoutId);
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
      for (const [id] of pending) pendingWorkerRasters.delete(id);
    }
  }
}

function timeoutWorkerRaster(id: number) {
  const request = pendingWorkerRasters.get(id);
  if (!request) return;
  pendingWorkerRasters.delete(id);
  request.reject(new Error('Magic sheet worker timed out'));
  request.worker.terminate();
  if (rasterWorker === request.worker) rasterWorker = null;
  redispatchWorkerRasters(request.worker);
}

function magicSheetRasterWorker() {
  if (rasterWorker) return rasterWorker;
  const worker = new Worker(new URL('./magicSheet.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }: MessageEvent<MagicSheetWorkerResponse>) => {
    const request = pendingWorkerRasters.get(data.id);
    if (!request || request.worker !== worker) {
      if ('bitmap' in data) data.bitmap.close();
      return;
    }
    if ('error' in data && data.code !== undefined) {
      failRasterWorker(worker, new Error(data.error));
      return;
    }
    pendingWorkerRasters.delete(data.id);
    clearTimeout(request.timeoutId);
    if ('error' in data) request.reject(new Error(data.error));
    else request.resolve(data.bitmap);
  });
  worker.addEventListener('error', (event) => {
    failRasterWorker(worker, new Error(event.message || 'Magic sheet worker failed'));
  });
  worker.addEventListener('messageerror', () => {
    failRasterWorker(worker, new Error('Magic sheet worker response could not be decoded'));
  });
  rasterWorker = worker;
  return worker;
}

export function rasterizeMagicSheetInWorker(request: MagicSheetWorkerRequestPayload) {
  const id = ++nextRasterRequestId;
  const { promise, resolve, reject } = promiseWithResolvers<ImageBitmap>();
  let worker: Worker;
  try {
    worker = magicSheetRasterWorker();
  } catch (error) {
    reject(error instanceof Error ? error : new Error(String(error)));
    return promise;
  }
  const timeoutId = setTimeout(() => timeoutWorkerRaster(id), MAGIC_SHEET_WORKER_TIMEOUT_MS);
  pendingWorkerRasters.set(id, { resolve, reject, timeoutId, worker, request });
  try {
    worker.postMessage({ ...request, id });
  } catch (error) {
    failRasterWorker(worker, error instanceof Error ? error : new Error(String(error)));
  }
  return promise;
}
