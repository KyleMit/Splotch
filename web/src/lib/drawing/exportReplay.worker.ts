import { CPU_SURFACE_SETTINGS } from './canvas2d';
import {
  CanvasContextRecoveryError,
  createOffscreenCanvas2dSurface,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';
import { configureReplayCrayon, paintReplayExport } from './exportReplayPaint';
import {
  closeReplayPngInput,
  type EncodePngResponse,
  type EncodeReplayPngRequest,
} from './pngEncoderProtocol';
import { createLayeredPngPreview } from './tiledPngCompositor';

interface ReplayWorkerScope {
  onmessage: ((event: MessageEvent<EncodeReplayPngRequest>) => void) | null;
  postMessage(message: EncodePngResponse, transfer?: Transferable[]): void;
}

// The app type-checks against the DOM lib, which types `self` as Window; the webworker lib cannot
// join the same program, so the worker scope is declared here.
const replayWorker = self as unknown as ReplayWorkerScope;

function postPreview(id: number, data: EncodeReplayPngRequest) {
  if (!data.preview) return;
  const { width, ...tiles } = data.preview;
  let preview: ImageBitmap | null = null;
  try {
    preview = createLayeredPngPreview(
      { ...tiles, texture: data.texture, overlay: data.overlay, paperColor: data.paperColor },
      width
    );
    replayWorker.postMessage({ id, preview }, [preview]);
    preview = null;
  } catch {
    // Preview feedback is optional; its failure must not cancel the PNG save.
    preview?.close();
  }
}

replayWorker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    postPreview(id, data);
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
