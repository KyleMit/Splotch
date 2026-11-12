import { CPU_SURFACE_SETTINGS } from './canvas2d';
import {
  CanvasContextRecoveryError,
  createOffscreenCanvas2dSurface,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';
import { encoderWorkerScope, postPreview } from './encoderWorkerScope';
import { configureReplayCrayon, paintReplayExport } from './exportReplayPaint';
import { closeReplayPngInput, type EncodeReplayPngRequest } from './pngEncoderProtocol';

const replayWorker = encoderWorkerScope<EncodeReplayPngRequest>();

replayWorker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.preview) {
      const { width, ...layers } = data.preview;
      postPreview(
        replayWorker,
        id,
        { ...layers, texture: data.texture, overlay: data.overlay, paperColor: data.paperColor },
        width
      );
    }
    const blob = await runWithCanvasContextRecovery(
      () =>
        createOffscreenCanvas2dSurface(
          data.width,
          data.height,
          'Export replay could not allocate a 2D context',
          CPU_SURFACE_SETTINGS
        ),
      ({ canvas, context }) => {
        // Configured inside the attempt: a retry waits on a restore, and a second export's own
        // configuration may have run meanwhile.
        configureReplayCrayon(data.crayon);
        paintReplayExport(context, data);
        return canvas.convertToBlob({ type: 'image/png' });
      }
    );
    replayWorker.postMessage({ id, blob });
  } catch (error) {
    replayWorker.postMessage({
      id,
      error: String(error),
      ...(error instanceof CanvasContextRecoveryError ? { code: error.code } : {}),
    });
  } finally {
    closeReplayPngInput(data);
  }
};
