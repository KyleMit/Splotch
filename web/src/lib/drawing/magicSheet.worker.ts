export interface MagicSheetWorkerRequest {
  id: number;
  imageUrl: string;
  width: number;
  height: number;
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

export type MagicSheetWorkerResponse =
  | { id: number; bitmap: ImageBitmap }
  | { id: number; error: string };

interface MagicSheetWorkerScope {
  onmessage: ((event: MessageEvent<MagicSheetWorkerRequest>) => void) | null;
  postMessage(message: MagicSheetWorkerResponse, transfer: Transferable[]): void;
}

const workerScope = self as unknown as MagicSheetWorkerScope;

workerScope.onmessage = async ({ data }) => {
  let image: ImageBitmap | null = null;
  try {
    const response = await fetch(data.imageUrl);
    if (!response.ok) throw new Error(`Magic sheet worker could not load ${data.imageUrl}`);
    image = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(data.width, data.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Magic sheet worker could not allocate a 2D context');
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
    const bitmap = canvas.transferToImageBitmap();
    workerScope.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (error) {
    workerScope.postMessage({ id: data.id, error: String(error) }, []);
  } finally {
    image?.close();
  }
};
