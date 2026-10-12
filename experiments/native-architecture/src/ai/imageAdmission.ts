import type { AiMime } from './contract';
import { createPngWork } from '../drawing/pngWork';
import { imageBytes } from './imageBounds';
import { pngResultGrid } from './pngResult';
import { jpegResultGrid } from './jpegResult';
import { webpResultGrid } from './webpResult';
export type AiImageAdmission = (bytes: Uint8Array, mime: AiMime) => Promise<void>;
export async function resultImageGrid(bytes: Uint8Array, mime: AiMime, isCurrent: () => boolean) {
  imageBytes(bytes);
  const work = createPngWork(isCurrent);
  work.check();
  const grid = await (mime === 'image/png'
    ? pngResultGrid(bytes, work)
    : mime === 'image/jpeg'
      ? jpegResultGrid(bytes, work)
      : webpResultGrid(bytes, work));
  work.check();
  return grid;
}
