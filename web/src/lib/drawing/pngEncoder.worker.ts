import { composeTiledPngCanvas, createTiledPngPreview } from './tiledPngCompositor';
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
      const canvas = composeTiledPngCanvas(data);
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
      encoderWorker.postMessage({ id, blob: await encoded });
      return;
    }
    const canvas = new OffscreenCanvas(data.bitmap.width, data.bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG encoder could not allocate a 2D context');
    context.drawImage(data.bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    encoderWorker.postMessage({ id, blob });
  } catch (error) {
    encoderWorker.postMessage({ id, error: String(error) });
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
