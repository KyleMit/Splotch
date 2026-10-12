import { PNG_TIMEOUT_MS } from './svgCapture';
import { createInkObservationController } from './inkObservation';
import { EMPTY_ALPHA_THRESHOLD, MAX_PNG_BASE64_CHARACTERS, MAX_PNG_PIXELS } from './pngLimits';

const PNG_HEADER_BASE64_CHARACTERS = 44;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pngSize(base64: string) {
  if (base64.length > MAX_PNG_BASE64_CHARACTERS)
    throw new Error('This picture is too large to check.');
  const header = Uint8Array.from(
    atob(base64.replace(/\s/g, '').slice(0, PNG_HEADER_BASE64_CHARACTERS)),
    (character) => character.charCodeAt(0)
  );
  if (
    header.length < PNG_HEIGHT_OFFSET + 4 ||
    !PNG_SIGNATURE.every((byte, index) => header[index] === byte)
  )
    throw new Error('Picture capture returned an invalid PNG.');
  const view = new DataView(header.buffer);
  const width = view.getUint32(PNG_WIDTH_OFFSET);
  const height = view.getUint32(PNG_HEIGHT_OFFSET);
  if (!width || !height || width * height > MAX_PNG_PIXELS)
    throw new Error('Picture capture returned unsupported dimensions.');
  return { width, height };
}

export function inkPngIsEmpty(base64: string): Promise<boolean> {
  const size = pngSize(base64);
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    let active = true;
    function fail() {
      if (!active) return;
      active = false;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      reject(new Error('This picture could not be checked. Your drawing is still here.'));
    }
    const timeout = setTimeout(fail, PNG_TIMEOUT_MS);
    image.onerror = fail;
    image.onload = () => {
      if (!active) return;
      try {
        if (image.naturalWidth !== size.width || image.naturalHeight !== size.height)
          throw new Error('PNG dimensions changed while decoding.');
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Pixel observation is unavailable.');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, size.width, size.height).data;
        let empty = true;
        for (let alpha = 3; alpha < pixels.length; alpha += 4) {
          if (pixels[alpha] >= EMPTY_ALPHA_THRESHOLD) {
            empty = false;
            break;
          }
        }
        active = false;
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        canvas.width = 0;
        canvas.height = 0;
        resolve(empty);
      } catch {
        fail();
      }
    };
    image.src = `data:image/png;base64,${base64}`;
  });
}

export function createInkObservation() {
  return createInkObservationController(
    () => ({ grid: null, current: () => true, dispose() {} }),
    (base64) => inkPngIsEmpty(base64)
  );
}
