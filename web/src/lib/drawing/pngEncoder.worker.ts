import {
  CanvasContextRecoveryError,
  createOffscreenCanvas2dSurface,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';
import {
  createTiledPngPreview,
  createTiledPngSurface,
  paintTiledPngSurface,
} from './tiledPngCompositor';
import type { EncodePngRequest, EncodePngResponse } from './pngEncoderProtocol';

interface EncoderWorkerScope {
  onmessage: ((event: MessageEvent<EncodePngRequest>) => void) | null;
  postMessage(message: EncodePngResponse, transfer?: Transferable[]): void;
}

const encoderWorker = self as unknown as EncoderWorkerScope;

encoderWorker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.kind === 'tiles') {
      const blob = await runWithCanvasContextRecovery(
        () => createTiledPngSurface(data),
        ({ canvas, context }) => {
          paintTiledPngSurface({ canvas, context }, data);
          const encoded = canvas.convertToBlob({ type: 'image/png' });
          if (data.previewWidth) {
            let preview: ImageBitmap | null = null;
            try {
              preview = createTiledPngPreview(canvas, data.previewWidth);
              encoderWorker.postMessage({ id, preview }, [preview]);
              preview = null;
            } catch {
              // Preview feedback is optional; its failure must not cancel the already-started PNG save.
              preview?.close();
            }
          }
          return encoded;
        }
      );
      encoderWorker.postMessage({ id, blob });
      return;
    }
    const blob = await runWithCanvasContextRecovery(
      () =>
        createOffscreenCanvas2dSurface(
          data.bitmap.width,
          data.bitmap.height,
          'PNG encoder could not allocate a 2D context'
        ),
      ({ canvas, context }) => {
        context.drawImage(data.bitmap, 0, 0);
        return canvas.convertToBlob({ type: 'image/png' });
      }
    );
    encoderWorker.postMessage({ id, blob });
  } catch (error) {
    encoderWorker.postMessage({
      id,
      error: String(error),
      ...(error instanceof CanvasContextRecoveryError ? { code: error.code } : {}),
    });
  } finally {
    if (data.kind === 'tiles') {
      for (const tile of data.tiles) tile.bitmap.close();
      data.texture?.close();
      data.overlay?.close();
    } else {
      data.bitmap.close();
    }
  }
};
