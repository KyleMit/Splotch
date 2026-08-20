import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export const LIGHT_OVERLAY_SUFFIX = '.overlay.svg';
export const DARK_OVERLAY_SUFFIX = '.dark.overlay.svg';
export const LINE_ART_ALPHA_THRESHOLD = 105;

export function lightLineArtPath(path) {
  return path.replace(DARK_OVERLAY_SUFFIX, LIGHT_OVERLAY_SUFFIX);
}

export function darkLineArtPath(path) {
  return path.slice(0, -LIGHT_OVERLAY_SUFFIX.length) + DARK_OVERLAY_SUFFIX;
}

export function lineArtStem(path) {
  for (const suffix of [DARK_OVERLAY_SUFFIX, LIGHT_OVERLAY_SUFFIX]) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
  }
  throw new Error(`Not canonical line art: ${path}`);
}

async function alphaPlane(input, width, height) {
  let image = sharp(typeof input === 'string' ? await readFile(input) : input).ensureAlpha();
  if (width !== undefined && height !== undefined)
    image = image.resize(width, height, { fit: 'fill' });
  return image.extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
}

export async function rasterizeLineArt(input, dimensions = {}) {
  if (typeof input === 'string' && !input.endsWith('.svg')) return readFile(input);
  const { data, info } = await alphaPlane(input, dimensions.width, dimensions.height);
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let p = 0; p < data.length; p++) {
    const value = 255 - data[p];
    rgb[p * 3] = value;
    rgb[p * 3 + 1] = value;
    rgb[p * 3 + 2] = value;
  }
  return sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png()
    .toBuffer();
}

export async function lineArtMask(input, width, height) {
  const { data } = await alphaPlane(input, width, height);
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let p = 0; p < data.length; p++) {
    if (data[p] > LINE_ART_ALPHA_THRESHOLD) {
      mask[p] = 1;
      count++;
    }
  }
  return { mask, count };
}

export async function resolveNightLineArt(lightPath, light = null) {
  const darkPath = darkLineArtPath(lightPath);
  const darked = existsSync(darkPath);
  const sourcePath = darked ? darkPath : lightPath;
  if (!existsSync(sourcePath)) return { sourcePath, source: null, chalk: null };
  const source = darked
    ? await rasterizeLineArt(sourcePath)
    : (light ?? (await rasterizeLineArt(sourcePath)));
  return { sourcePath, source, chalk: darked ? source : null };
}
