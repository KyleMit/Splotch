import { encodeTiledPng } from './tiledPngCompositor';
import type { EncodePngRequest, EncodePngResponse } from './pngEncoderProtocol';

interface EncoderWorkerScope {
  onmessage: ((event: MessageEvent<EncodePngRequest>) => void) | null;
  postMessage(message: EncodePngResponse): void;
}

const encoderWorker = self as unknown as EncoderWorkerScope;

encoderWorker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.kind === 'tiles') {
      encoderWorker.postMessage({ id, blob: await encodeTiledPng(data) });
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
