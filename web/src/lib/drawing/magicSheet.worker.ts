import {
  CanvasContextRecoveryError,
  createOffscreenCanvas2dSurface,
  type CanvasContextRecoveryErrorCode,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';
import { paintRainbowGradient, type RainbowGradient } from './magicSheetGradient';

interface MagicSheetImageSource {
  imageUrl: string;
  fit: { x: number; y: number; width: number; height: number };
  edgeFills: Array<{
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  }>;
}

interface MagicSheetGradientSource {
  gradient: RainbowGradient;
}

export type MagicSheetWorkerRequestPayload = {
  width: number;
  height: number;
} & (MagicSheetImageSource | MagicSheetGradientSource);

export type MagicSheetWorkerRequest = MagicSheetWorkerRequestPayload & {
  id: number;
};

export type MagicSheetWorkerResponse =
  | { id: number; bitmap: ImageBitmap }
  | { id: number; error: string; code?: CanvasContextRecoveryErrorCode };

interface MagicSheetWorkerScope {
  onmessage: ((event: MessageEvent<MagicSheetWorkerRequest>) => void) | null;
  postMessage(message: MagicSheetWorkerResponse, transfer: Transferable[]): void;
}

const workerScope = self as unknown as MagicSheetWorkerScope;

workerScope.onmessage = async ({ data }) => {
  let image: ImageBitmap | null = null;
  try {
    if ('imageUrl' in data) {
      const response = await fetch(data.imageUrl);
      if (!response.ok) throw new Error(`Magic sheet worker could not load ${data.imageUrl}`);
      image = await createImageBitmap(await response.blob());
    }
    const bitmap = await runWithCanvasContextRecovery(
      () =>
        createOffscreenCanvas2dSurface(
          data.width,
          data.height,
          'Magic sheet worker could not allocate a 2D context'
        ),
      ({ canvas, context }) => {
        if ('gradient' in data) {
          paintRainbowGradient(context, data.width, data.height, data.gradient);
        } else if (image) {
          context.drawImage(image, data.fit.x, data.fit.y, data.fit.width, data.fit.height);
          for (const fill of data.edgeFills) {
            context.drawImage(
              image,
              fill.sx,
              fill.sy,
              fill.sw,
              fill.sh,
              fill.dx,
              fill.dy,
              fill.dw,
              fill.dh
            );
          }
        }
        return canvas.transferToImageBitmap();
      },
      (discarded) => discarded.close()
    );
    workerScope.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (error) {
    workerScope.postMessage(
      {
        id: data.id,
        error: String(error),
        ...(error instanceof CanvasContextRecoveryError ? { code: error.code } : {}),
      },
      []
    );
  } finally {
    image?.close();
  }
};
