import { promiseWithResolvers } from '../promiseWithResolvers';
import {
  closeReplayPngInput,
  replayPngTransfer,
  type EncodePngPayload,
  type EncodePngResponse,
  type EncodeReplayPngRequest,
  type ReplayPngInput,
  type TiledPngInput,
} from './pngEncoderProtocol';

export type { ReplayPngInput, TiledPngInput } from './pngEncoderProtocol';

interface PendingEncode {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  onPreview?: (preview: ImageBitmap) => void;
}

type EncoderPayload = EncodePngPayload | Omit<EncodeReplayPngRequest, 'id'>;

interface EncoderWorker {
  request(
    message: EncoderPayload,
    transfer: Transferable[],
    onPreview?: (preview: ImageBitmap) => void
  ): Promise<Blob>;
  terminate(error: Error): void;
}

// One cached worker per kind: the PNG worker composes settled tiles; the replay worker carries the
// op renderers, so the matched-scale path never loads them.
interface EncoderSlot {
  current: EncoderWorker | null;
  spawn(): Worker;
}

const pngEncoderSlot: EncoderSlot = {
  current: null,
  spawn: () => new Worker(new URL('./pngEncoder.worker.ts', import.meta.url), { type: 'module' }),
};
const replayEncoderSlot: EncoderSlot = {
  current: null,
  spawn: () => new Worker(new URL('./exportReplay.worker.ts', import.meta.url), { type: 'module' }),
};

const ENCODE_TIMEOUT_MS = 15_000;

function encoderFor(slot: EncoderSlot): EncoderWorker {
  slot.current ??= createEncoderWorker(slot);
  return slot.current;
}

function createEncoderWorker(slot: EncoderSlot): EncoderWorker {
  const worker = slot.spawn();
  const pending = new Map<number, PendingEncode>();
  let nextRequestId = 0;
  const retire = (error: Error) => {
    encoder.terminate(error);
    if (slot.current === encoder) slot.current = null;
  };

  function request(
    message: EncoderPayload,
    transfer: Transferable[],
    onPreview?: (preview: ImageBitmap) => void
  ): Promise<Blob> {
    const id = ++nextRequestId;
    const { promise, resolve, reject } = promiseWithResolvers<Blob>();
    const timeoutId = setTimeout(() => {
      retire(new Error('PNG encoder worker timed out'));
    }, ENCODE_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeoutId, onPreview });
    try {
      worker.postMessage({ id, ...message }, transfer);
    } catch (error) {
      clearTimeout(timeoutId);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }

  function rejectPending(error: Error) {
    for (const request of pending.values()) {
      clearTimeout(request.timeoutId);
      request.reject(error);
    }
    pending.clear();
  }

  const encoder: EncoderWorker = {
    request,
    terminate(error) {
      worker.terminate();
      rejectPending(error);
    },
  };

  worker.addEventListener('message', (event: MessageEvent<EncodePngResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) {
      if ('preview' in event.data) event.data.preview.close();
      return;
    }
    if ('preview' in event.data) {
      if (!request.onPreview) {
        event.data.preview.close();
        return;
      }
      try {
        request.onPreview(event.data.preview);
      } catch {
        event.data.preview.close();
      }
      return;
    }
    // A coded error means the worker's canvas context is unrecoverable, so it retires the worker and
    // every request pending on it. Any other error reply settles only its own request.
    if ('error' in event.data && event.data.code !== undefined) {
      retire(new Error(event.data.error));
      return;
    }
    clearTimeout(request.timeoutId);
    pending.delete(event.data.id);
    if ('error' in event.data) {
      request.reject(new Error(event.data.error));
    } else if (event.data.blob.type !== 'image/png') {
      request.reject(new Error(`PNG encoder returned ${event.data.blob.type}`));
    } else {
      request.resolve(event.data.blob);
    }
  });
  worker.addEventListener('error', (event) => {
    retire(new Error(event.message || 'PNG encoder worker failed'));
  });
  worker.addEventListener('messageerror', () => {
    retire(new Error('PNG encoder worker response could not be decoded'));
  });

  return encoder;
}

function pngWorkerSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function encodeOnMainThread(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function encodeTiledCanvasPng(
  input: TiledPngInput,
  onPreview?: (preview: ImageBitmap) => void
): Promise<Blob | null> {
  try {
    const transfer = [
      ...input.tiles.map((tile) => tile.bitmap),
      ...(input.texture ? [input.texture] : []),
      ...(input.overlay ? [input.overlay] : []),
    ];
    return await encoderFor(pngEncoderSlot).request(
      { kind: 'tiles', ...input },
      transfer,
      onPreview
    );
  } catch {
    // The encoder alone decides when its worker is broken; retiring it here for this request's
    // failure would reject every concurrent export along with it.
    for (const tile of input.tiles) tile.bitmap.close();
    input.texture?.close();
    input.overlay?.close();
    return null;
  }
}

export async function encodeCanvasPng(
  canvas: HTMLCanvasElement | OffscreenCanvas
): Promise<Blob | null> {
  if (!pngWorkerSupported()) return encodeOnMainThread(canvas);

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(canvas);
    const blob = await encoderFor(pngEncoderSlot).request({ kind: 'canvas', bitmap }, [bitmap]);
    bitmap = null;
    return blob;
  } catch {
    bitmap?.close();
    return encodeOnMainThread(canvas);
  }
}

// Like the tiled path, a failed replay settles as null after releasing every bitmap it carried.
export async function encodeReplayPng(
  input: ReplayPngInput,
  onPreview?: (preview: ImageBitmap) => void
): Promise<Blob | null> {
  try {
    return await encoderFor(replayEncoderSlot).request(
      { kind: 'replay', ...input },
      replayPngTransfer(input),
      onPreview
    );
  } catch {
    closeReplayPngInput(input);
    return null;
  }
}
