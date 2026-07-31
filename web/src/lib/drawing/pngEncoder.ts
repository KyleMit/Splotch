interface PendingEncode {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

type EncodePngResponse = { id: number; blob: Blob } | { id: number; error: string };

interface PngEncoder {
  encode(bitmap: ImageBitmap): Promise<Blob>;
  terminate(error: Error): void;
}

let cachedEncoder: PngEncoder | null = null;

function createPngEncoder(): PngEncoder {
  const worker = new Worker(new URL('./pngEncoder.worker.ts', import.meta.url), {
    type: 'module',
  });
  const pending = new Map<number, PendingEncode>();
  let nextRequestId = 0;

  function rejectPending(error: Error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  const encoder: PngEncoder = {
    encode(bitmap) {
      const id = ++nextRequestId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, bitmap }, [bitmap]);
      });
    },
    terminate(error) {
      worker.terminate();
      rejectPending(error);
    },
  };

  worker.addEventListener('message', (event: MessageEvent<EncodePngResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
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
