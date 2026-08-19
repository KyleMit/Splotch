import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localWarp } from '../../../tools/asset-gen/lib/local-warp.mjs';
import { resolveNightLineArt } from '../../../tools/asset-gen/lib/asset-paths.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COLORING = join(REPO_ROOT, 'web/static/coloring');
const FILLSRC = join(REPO_ROOT, 'tools/asset-gen/fill-src');

export async function loadPair(rel, theme) {
  const penPath = join(COLORING, `${rel}.outline.webp`);
  const pen = await readFile(penPath);
  const source = theme === 'night' ? (await resolveNightLineArt(penPath, pen)).source : pen;
  const fill = await readFile(join(FILLSRC, `${rel}.${theme}.raw.webp`));
  return { source, fill };
}

export async function gray(buffer) {
  const { data, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function edgeMag(g, width, height) {
  const m = new Float32Array(width * height);
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      m[i] = Math.abs(g[i + 1] - g[i]) + Math.abs(g[i + width] - g[i]);
    }
  return m;
}

// magenta = line-art edge, cyan = paint edge, white = coincident
export function edgeOverlay(srcM, fillM, width, height, box, shiftX = 0, shiftY = 0, thr = 60) {
  const { x0, y0, w, h } = box;
  const out = Buffer.alloc(w * h * 3, 18);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const s = srcM[sy * width + sx] > thr;
      const fx = sx + shiftX, fy = sy + shiftY;
      const f = fx >= 0 && fy >= 0 && fx < width && fy < height && fillM[fy * width + fx] > thr;
      const o = (y * w + x) * 3;
      if (s && f) { out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; }
      else if (s) { out[o] = 255; out[o + 1] = 40; out[o + 2] = 200; }
      else if (f) { out[o] = 40; out[o + 1] = 230; out[o + 2] = 255; }
    }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } });
}

export function label(text, w, h = 34, fill = '#f2f2f2', bg = '#161616', size = 20) {
  const svg = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><text x="10" y="${h * 0.7}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
  return sharp(Buffer.from(svg)).png();
}

export async function stackRows(rows) {
  // rows: [{buffer,width,height}] -> vertical stack, left aligned
  const width = Math.max(...rows.map((r) => r.width));
  const height = rows.reduce((s, r) => s + r.height, 0);
  const comps = [];
  let top = 0;
  for (const r of rows) { comps.push({ input: r.buffer, left: 0, top }); top += r.height; }
  return sharp({ create: { width, height, channels: 3, background: '#161616' } }).composite(comps).png().toBuffer();
}

export async function rowOf(items, gap = 10, bg = '#161616') {
  const width = items.reduce((s, i) => s + i.width, 0) + gap * (items.length - 1);
  const height = Math.max(...items.map((i) => i.height));
  const comps = [];
  let left = 0;
  for (const i of items) { comps.push({ input: i.buffer, left, top: 0 }); left += i.width + gap; }
  const buffer = await sharp({ create: { width, height, channels: 3, background: bg } }).composite(comps).png().toBuffer();
  return { buffer, width, height };
}

export async function png(s) {
  const buffer = await s.png().toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  return { buffer, width, height };
}

export { localWarp };
