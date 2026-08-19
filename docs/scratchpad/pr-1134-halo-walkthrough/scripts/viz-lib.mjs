// Visualization helpers for the PR-1134 night-halo walkthrough. Re-derives the
// exact masks lib/night-halo.mjs scores, then paints them for human review.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt } from '/home/user/Splotch/tools/asset-gen/lib/asset-paths.mjs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import { bleedUnderMask, OUTLINE_LUMA_THRESHOLD } from '/home/user/Splotch/tools/asset-gen/lib/punch-fill.mjs';

const REF_DILATE = 4;
const MAX_BAND = 3;
export const DELTA_RIM = 40;
export const HALO_DARK = 145;
export const HALO_PROTECT_BLACK = 55;

const luma = (rgb, p) => 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];

async function rawOf(buf, w, h) {
  let img = sharp(buf).removeAlpha();
  if (w) img = img.resize(w, h, { fit: 'fill' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

export async function analyzePage(page) {
  const rawBuf = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  const { source: lineArt, chalk } = await resolveNightLineArt(penPath);
  const shippedBuf = await readFile(join(COLORING_DIR, `${page}.night.webp`));

  const { rgb: raw, width: w, height: h } = await rawOf(rawBuf);
  const { rgb: line } = await rawOf(lineArt, w, h);
  const { rgb: shipped } = await rawOf(shippedBuf);

  const mask = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3)
    if (0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2] < OUTLINE_LUMA_THRESHOLD)
      mask[p] = 1;

  const refRgb = Buffer.from(raw);
  bleedUnderMask(refRgb, dilateMask(mask, w, h, REF_DILATE), w, h);

  const punched = Buffer.from(raw);
  bleedUnderMask(punched, mask, w, h);

  const bands = [];
  let prev = mask;
  for (let d = 1; d <= MAX_BAND; d++) {
    const grown = dilateMask(prev, w, h, 1);
    const band = [];
    for (let p = 0; p < w * h; p++) if (grown[p] && !prev[p]) band.push(p);
    bands.push(band);
    prev = grown;
  }

  const delta = (p) => luma(refRgb, p) - luma(shipped, p);
  const isRim = (p) => delta(p) > DELTA_RIM;
  const isHalo = (p) => isRim(p) && luma(shipped, p) >= HALO_PROTECT_BLACK && luma(shipped, p) < HALO_DARK;

  const halo = new Uint8Array(w * h);
  const rim = new Uint8Array(w * h);
  const ring12 = new Uint8Array(w * h);
  for (const [i, band] of bands.entries())
    for (const p of band) {
      if (i < 2) ring12[p] = 1;
      if (isRim(p)) rim[p] = 1;
      if (isHalo(p)) halo[p] = 1;
    }
  let n12 = 0, halo12 = 0, rim12 = 0;
  for (const [i, band] of bands.entries()) {
    if (i >= 2) continue;
    n12 += band.length;
    for (const p of band) { if (halo[p]) halo12++; if (rim[p]) rim12++; }
  }

  const TILE = 64;
  const counts = new Map();
  for (let p = 0; p < w * h; p++) {
    if (!halo[p]) continue;
    const k = `${Math.floor((p % w) / TILE)},${Math.floor(Math.floor(p / w) / TILE)}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const hotspots = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => {
    const [col, row] = k.split(',').map(Number);
    return { left: col * TILE, top: row * TILE, haloPx: n };
  });

  return {
    page, w, h, raw, shipped, refRgb, punched, mask, halo, rim, ring12, chalk, lineArt,
    shippedBuf, rawBuf,
    haloScore: +((100 * halo12) / (n12 || 1)).toFixed(3),
    rawScore: +((100 * rim12) / (n12 || 1)).toFixed(3),
    haloPx12: halo12, hotspots,
  };
}

export function toPng({ rgb, w, h }) {
  return sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

// Paint mask pixels onto a copy of an RGB buffer.
export function paint(rgb, w, h, layers) {
  const out = Buffer.from(rgb);
  for (const { mask, color, dim } of layers) {
    for (let p = 0; p < w * h; p++) {
      if (!mask[p]) continue;
      for (let c = 0; c < 3; c++)
        out[p * 3 + c] = dim ? Math.round(out[p * 3 + c] * (1 - dim) + color[c] * dim) : color[c];
    }
  }
  return out;
}

export async function crop(rgb, w, h, box, zoom = 3) {
  const left = Math.max(0, Math.min(w - box.width, box.left));
  const top = Math.max(0, Math.min(h - box.height, box.top));
  return sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } })
    .extract({ left, top, width: Math.min(box.width, w), height: Math.min(box.height, h) })
    .resize(Math.min(box.width, w) * zoom, Math.min(box.height, h) * zoom, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function textSvg(lines, width, { size = 20, color = '#1b1b1f', weight = 600, lead = 1.35 } = {}) {
  const height = Math.ceil(lines.length * size * lead + 8);
  const body = lines
    .map((l, i) => {
      const [txt, col] = Array.isArray(l) ? l : [l, color];
      return `<text x="0" y="${Math.round(size * (i + 1) * lead)}" font-family="DejaVu Sans, Verdana, sans-serif" font-size="${size}" font-weight="${weight}" fill="${col}">${esc(txt)}</text>`;
    })
    .join('');
  return { svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`), height };
}

// Compose a grid of {buf, caption} cells.
export async function grid({ cells, cols, cellW, cellH, gap = 18, pad = 24, title, subtitle, bg = '#faf7f2', capSize = 18 }) {
  const rows = Math.ceil(cells.length / cols);
  const capH = capSize * 2 + 14;
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;
  const headW = width - pad * 2;
  const headTitle = title ? textSvg([title], headW, { size: 30, weight: 700 }) : null;
  const headSub = subtitle ? textSvg(Array.isArray(subtitle) ? subtitle : [subtitle], headW, { size: 19, weight: 400, color: '#4a4550' }) : null;
  const headH = (headTitle ? headTitle.height : 0) + (headSub ? headSub.height + 4 : 0) + (title || subtitle ? 14 : 0);
  const height = pad * 2 + headH + rows * (cellH + capH) + (rows - 1) * gap;
  const comps = [];
  if (headTitle) comps.push({ input: headTitle.svg, left: pad, top: pad });
  if (headSub) comps.push({ input: headSub.svg, left: pad, top: pad + (headTitle ? headTitle.height : 0) });
  for (const [i, cell] of cells.entries()) {
    const r = Math.floor(i / cols), c = i % cols;
    const left = pad + c * (cellW + gap);
    const top = pad + headH + r * (cellH + capH + gap);
    if (cell.buf) comps.push({ input: cell.buf, left, top });
    const caps = (cell.caption ?? []).slice(0, 2);
    if (caps.length) {
      const t = textSvg(caps, cellW, { size: capSize, weight: 600 });
      comps.push({ input: t.svg, left, top: top + cellH + 4 });
    }
  }
  return sharp({ create: { width, height, channels: 3, background: bg } }).composite(comps).png().toBuffer();
}

export async function fit(buf, w, h) {
  return sharp(buf).resize(w, h, { fit: 'contain', background: '#faf7f2' }).png().toBuffer();
}
