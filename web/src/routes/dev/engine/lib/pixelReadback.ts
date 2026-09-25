// The harness draws in pure red and the paper background never is, so these
// bounds separate stroke pixels from paper without matching an exact color.
const STROKE_RED_MIN = 200;
const STROKE_OTHER_CHANNEL_MAX = 100;

interface RgbaPixels {
  data: Uint8ClampedArray;
}

interface RgbaImage extends RgbaPixels {
  width: number;
  height: number;
}

interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export async function decodeBlobImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const decodeCanvas = document.createElement('canvas');
  decodeCanvas.width = bitmap.width;
  decodeCanvas.height = bitmap.height;
  const decodeCtx = decodeCanvas.getContext('2d')!;
  decodeCtx.drawImage(bitmap, 0, 0);
  return decodeCtx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export function countStrokeRedPixels({ data }: RgbaPixels): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] > STROKE_RED_MIN &&
      data[i + 1] < STROKE_OTHER_CHANNEL_MAX &&
      data[i + 2] < STROKE_OTHER_CHANNEL_MAX
    )
      n++;
  }
  return n;
}

export function countOpaquePixels({ data }: RgbaPixels): number {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
  return n;
}

export function opaqueBounds({ data, width, height }: RgbaImage): PixelBounds | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
