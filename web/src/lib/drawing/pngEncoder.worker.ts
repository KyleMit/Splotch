import {
  CanvasContextRecoveryError,
  createOffscreenCanvas2dSurface,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';
import { CPU_SURFACE_SETTINGS } from './canvas2d';
import { createTiledPngSurface, paintTiledPngSurface, readTilesOnce } from './tiledPngCompositor';
import type { EncodePngRequest } from './pngEncoderProtocol';
import { encoderWorkerScope, postPreview } from './encoderWorkerScope';

const encoderWorker = encoderWorkerScope<EncodePngRequest>();

encoderWorker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.kind === 'tiles') {
      const layers = data.previewWidth ? { ...data, tiles: readTilesOnce(data.tiles) } : data;
      if (data.previewWidth) postPreview(encoderWorker, id, layers, data.previewWidth);
      const blob = await runWithCanvasContextRecovery(
        () => createTiledPngSurface(data),
        ({ canvas, context }) => {
          paintTiledPngSurface({ canvas, context }, layers);
          return canvas.convertToBlob({ type: 'image/png' });
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
          'PNG encoder could not allocate a 2D context',
          CPU_SURFACE_SETTINGS
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
