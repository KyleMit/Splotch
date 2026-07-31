interface EncodeCanvasPngRequest {
  id: number;
  kind: 'canvas';
  bitmap: ImageBitmap;
}

interface EncodeTiledPngRequest {
  id: number;
  kind: 'tiles';
  sourceWidth: number;
  sourceHeight: number;
  sourceScale: number;
  exportScale: number;
  tiles: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
  texture: ImageBitmap | null;
  overlay: ImageBitmap | null;
  paperColor: string;
}

type EncodePngRequest = EncodeCanvasPngRequest | EncodeTiledPngRequest;
type EncodePngResponse = { id: number; blob: Blob } | { id: number; error: string };

interface EncoderWorkerScope {
  onmessage: ((event: MessageEvent<EncodePngRequest>) => void) | null;
  postMessage(message: EncodePngResponse): void;
}

const encoderWorker = self as unknown as EncoderWorkerScope;

function drawContainedOverlay(
  context: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  overlay: ImageBitmap
) {
  const scale = Math.min(canvas.width / overlay.width, canvas.height / overlay.height);
  const width = overlay.width * scale;
  const height = overlay.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.globalCompositeOperation = 'source-over';
  context.drawImage(overlay, x, y, width, height);
  context.globalCompositeOperation = 'source-over';
}

async function encodeTiledPng(data: EncodeTiledPngRequest): Promise<Blob> {
  const width = Math.round((data.sourceWidth / data.sourceScale) * data.exportScale);
  const height = Math.round((data.sourceHeight / data.sourceScale) * data.exportScale);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG encoder could not allocate a 2D context');

  context.fillStyle = data.paperColor;
  context.fillRect(0, 0, width, height);
  if (data.texture) {
    const pattern = context.createPattern(data.texture, 'repeat');
    if (pattern) {
      context.setTransform(data.exportScale, 0, 0, data.exportScale, 0, 0);
      context.fillStyle = pattern;
      context.fillRect(0, 0, width / data.exportScale, height / data.exportScale);
      context.resetTransform();
    }
  }

  const tileScale = data.exportScale / data.sourceScale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.setTransform(tileScale, 0, 0, tileScale, 0, 0);
  for (const tile of data.tiles) context.drawImage(tile.bitmap, tile.x, tile.y);
  context.resetTransform();
  if (data.overlay) drawContainedOverlay(context, canvas, data.overlay);
  return canvas.convertToBlob({ type: 'image/png' });
}

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
