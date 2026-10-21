import { webAssetUri } from '../platform/webAsset';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import type { PictureExport } from './pictureExport';

const PNG_PREFIX = 'data:image/png;base64,';

function decodeImage(src: string): Promise<HTMLImageElement> {
  const image = new window.Image();
  image.src = src;
  return image.decode().then(() => image);
}

// A pure memoization cache: a grain that failed to load is forgotten, so the next save retries it.
let grain: Promise<HTMLImageElement | null> | null = null;

// As the shipping export does, a grain that will not load leaves the plain paper color.
function loadGrain(): Promise<HTMLImageElement | null> {
  if (grain) return grain;
  const loading = decodeImage(webAssetUri(handmadePaper)).catch(() => {
    if (grain === loading) grain = null;
    return null;
  });
  grain = loading;
  return loading;
}

// The shipping export compositor's paper (exportCompositor.ts paintExportPaper): the grain tiled
// one texel per CSS pixel, then the paper color, both beneath the picture already drawn.
function paintPaper(
  context: CanvasRenderingContext2D,
  picture: PictureExport,
  texture: HTMLImageElement | null
) {
  const width = picture.size.width / picture.scale;
  const height = picture.size.height / picture.scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.setTransform(picture.scale, 0, 0, picture.scale, 0, 0);
  context.globalCompositeOperation = 'destination-over';
  if (texture) {
    const pattern = context.createPattern(texture, 'repeat');
    if (pattern) {
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
    }
  }
  context.fillStyle = picture.paper;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  context.resetTransform();
}

// Each captured layer, bottom first, stretched onto the saved picture's grid over its paper.
export async function composePicture(
  layersBase64: readonly string[],
  picture: PictureExport,
  includePaperTexture = true
) {
  const [layers, texture] = await Promise.all([
    Promise.all(layersBase64.map((layer) => decodeImage(`${PNG_PREFIX}${layer}`))),
    includePaperTexture ? loadGrain() : Promise.resolve(null),
  ]);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = picture.size.width;
    canvas.height = picture.size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Picture export is unavailable.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    for (const layer of layers)
      context.drawImage(layer, 0, 0, picture.size.width, picture.size.height);
    paintPaper(context, picture, texture);
    const png = canvas.toDataURL('image/png');
    if (!png.startsWith(PNG_PREFIX)) throw new Error('Picture export did not return a PNG.');
    return png.slice(PNG_PREFIX.length);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
