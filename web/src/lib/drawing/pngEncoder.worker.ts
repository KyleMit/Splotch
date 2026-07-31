interface EncodePngRequest {
  id: number;
  bitmap: ImageBitmap;
}

type EncodePngResponse = { id: number; blob: Blob } | { id: number; error: string };

interface EncoderWorkerScope {
  onmessage: ((event: MessageEvent<EncodePngRequest>) => void) | null;
  postMessage(message: EncodePngResponse): void;
}

const encoderWorker = self as unknown as EncoderWorkerScope;

encoderWorker.onmessage = async ({ data: { id, bitmap } }) => {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG encoder could not allocate a 2D context');
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    encoderWorker.postMessage({ id, blob });
  } catch (error) {
    encoderWorker.postMessage({ id, error: String(error) });
  } finally {
    bitmap.close();
  }
};
