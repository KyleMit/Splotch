import type { EncodePngPayload, EncodePngResponse, TiledPngInput } from './pngEncoderProtocol';

export type { TiledPngInput } from './pngEncoderProtocol';

interface PendingEncode {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  onPreview?: (preview: ImageBitmap) => void;
}

interface PngEncoder {
  encode(bitmap: ImageBitmap): Promise<Blob>;
  encodeTiles(input: TiledPngInput, onPreview?: (preview: ImageBitmap) => void): Promise<Blob>;
  terminate(error: Error): void;
}

let cachedEncoder: PngEncoder | null = null;

const ENCODE_TIMEOUT_MS = 15_000;

function createPngEncoder(): PngEncoder {
  const worker = new Worker(new URL('./pngEncoder.worker.ts', import.meta.url), {
    type: 'module',
  });
  const pending = new Map<number, PendingEncode>();
  let nextRequestId = 0;

  function request<T extends EncodePngPayload>(
    message: T,
    transfer: Transferable[],
    onPreview?: (preview: ImageBitmap) => void
  ): Promise<Blob> {
    const id = ++nextRequestId;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error('PNG encoder worker timed out');
        encoder.terminate(error);
        if (cachedEncoder === encoder) cachedEncoder = null;
      }, ENCODE_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeoutId, onPreview });
      try {
        worker.postMessage({ id, ...message }, transfer);
      } catch (error) {
        clearTimeout(timeoutId);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function rejectPending(error: Error) {
    for (const request of pending.values()) {
      clearTimeout(request.timeoutId);
      request.reject(error);
    }
    pending.clear();
  }

  const encoder: PngEncoder = {
    encode(bitmap) {
      return request({ kind: 'canvas', bitmap }, [bitmap]);
    },
    encodeTiles(input, onPreview) {
      const transfer = [
        ...input.tiles.map((tile) => tile.bitmap),
        ...(input.texture ? [input.texture] : []),
        ...(input.overlay ? [input.overlay] : []),
      ];
      return request({ kind: 'tiles', ...input }, transfer, onPreview);
    },
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
    clearTimeout(request.timeoutId);
    pending.delete(event.data.id);
    if ('error' in event.data) {
      request.reject(new Error(event.data.error));
    } else {
      request.resolve(event.data.blob);
    }
  });
  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'PNG encoder worker failed');
    encoder.terminate(error);
    if (cachedEncoder === encoder) cachedEncoder = null;
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
    cachedEncoder ??= createPngEncoder();
    const blob = await cachedEncoder.encodeTiles(input, onPreview);
    if (blob.type !== 'image/png') throw new Error(`PNG encoder returned ${blob.type}`);
    return blob;
  } catch (error) {
    for (const tile of input.tiles) tile.bitmap.close();
    input.texture?.close();
    input.overlay?.close();
    if (cachedEncoder) {
      cachedEncoder.terminate(error instanceof Error ? error : new Error(String(error)));
      cachedEncoder = null;
    }
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
    cachedEncoder ??= createPngEncoder();
    const blob = await cachedEncoder.encode(bitmap);
    bitmap = null;
    if (blob.type !== 'image/png') throw new Error(`PNG encoder returned ${blob.type}`);
    return blob;
  } catch (error) {
    bitmap?.close();
    if (cachedEncoder) {
      cachedEncoder.terminate(error instanceof Error ? error : new Error(String(error)));
      cachedEncoder = null;
    }
    return encodeOnMainThread(canvas);
  }
}
