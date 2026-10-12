// Idea 20 experiment (temporary — delete after the run): lanczos-upscale the
// committed dragon-wide raw fill 2x, re-punch it at 3072x2048, then simulate the
// iPad Pro 13 landscape display (2564x1709 device px, measured) for both the
// shipped 1536 pipeline and the upscaled 3072 pipeline, and emit same-crop
// comparisons of line-adjacent detail. Outputs go to IDEA_DIR only.
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const IDEA_DIR = process.env.IDEA_DIR;
if (!IDEA_DIR) throw new Error('set IDEA_DIR');
mkdirSync(join(IDEA_DIR, 'work'), { recursive: true });

const OUTLINE_LUMA_THRESHOLD = 150;
const DISPLAY_W = 2564;
const DISPLAY_H = 1709;

// Copy of punch-fill.mjs's bleedUnderMask (not exported there).
function bleedUnderMask(rgb, mask, width, height) {
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < width * height; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || pending[q]) continue;
        r += rgb[q * 3];
        g += rgb[q * 3 + 1];
        b += rgb[q * 3 + 2];
        n++;
      }
      if (!n) {
        next.push(p);
        continue;
      }
      rgb[p * 3] = Math.round(r / n);
      rgb[p * 3 + 1] = Math.round(g / n);
      rgb[p * 3 + 2] = Math.round(b / n);
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
}

function punch(fill, line, width, height) {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  bleedUnderMask(fill, mask, width, height);
  return fill;
}

function multiply(fill, line, n) {
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = Math.round((fill[i] * line[i]) / 255);
  return out;
}

const rawPath = join(FILL_SRC_DIR, 'creatures/dragon-wide.light.raw.webp');
const outlinePath = join(COLORING_DIR, 'creatures/dragon-wide.outline.webp');
const shippedFillPath = join(COLORING_DIR, 'creatures/dragon-wide.light.webp');

// ---- Path B: lanczos-2x the raw + outline, re-punch at 3072 ----------------
const up = { w: 3072, h: 2048 };
const rawUp = await sharp(await readFile(rawPath))
  .removeAlpha()
  .resize(up.w, up.h, { kernel: 'lanczos3' })
  .raw()
  .toBuffer({ resolveWithObject: true });
const outlineUp = await sharp(await readFile(outlinePath))
  .removeAlpha()
  .resize(up.w, up.h, { kernel: 'lanczos3' })
  .raw()
  .toBuffer({ resolveWithObject: true });
console.time('punch@3072');
const punchedUp = punch(rawUp.data, outlineUp.data, up.w, up.h);
console.timeEnd('punch@3072');
const punchedUpWebp = await sharp(punchedUp, { raw: { width: up.w, height: up.h, channels: 3 } })
  .webp({ quality: 85, effort: 6 })
  .toBuffer();
console.log('upscaled re-punched fill webp bytes:', punchedUpWebp.length);
const shippedBytes = (await readFile(shippedFillPath)).length;
console.log('shipped fill webp bytes:', shippedBytes);

// ---- Simulate the iPad Pro 13 landscape display (2564x1709) ----------------
// Fill path: canvas drawImage default smoothing ~= bilinear -> kernel 'linear'.
// Outline path: browser <img> upscale -> use lanczos3 as the favorable stand-in
// (identical in both pipelines, so it cancels out of the comparison).
const fillShippedDisp = await sharp(await readFile(shippedFillPath))
  .removeAlpha()
  .resize(DISPLAY_W, DISPLAY_H, { kernel: 'linear' })
  .raw()
  .toBuffer({ resolveWithObject: true });
const fillUpDisp = await sharp(punchedUpWebp)
  .removeAlpha()
  .resize(DISPLAY_W, DISPLAY_H, { kernel: 'linear' })
  .raw()
  .toBuffer({ resolveWithObject: true });
const outlineDisp = await sharp(await readFile(outlinePath))
  .removeAlpha()
  .resize(DISPLAY_W, DISPLAY_H, { kernel: 'lanczos3' })
  .raw()
  .toBuffer({ resolveWithObject: true });
// Bonus reference: what a 3072 outline would look like (regen-at-high-res proxy
// is NOT this — lanczos adds no detail — but shows the punch-mask alignment).
const n = DISPLAY_W * DISPLAY_H;
const combinedShipped = multiply(fillShippedDisp.data, outlineDisp.data, n);
const combinedUp = multiply(fillUpDisp.data, outlineDisp.data, n);

// ---- Crops (display-space) --------------------------------------------------
// face/eyes: 1536-space (720,320)-(1000,530) -> display x1.669
const crops = [
  { name: 'face', x: 1290, y: 560, size: 280 },
  { name: 'flower', x: 90, y: 1230, size: 280 },
];
const meanAbsDiff = (a, b, len) => {
  let s = 0;
  for (let i = 0; i < len; i++) s += Math.abs(a[i] - b[i]);
  return s / len;
};
console.log(
  'display-space mean abs diff (fill only):',
  meanAbsDiff(fillShippedDisp.data, fillUpDisp.data, n * 3).toFixed(3)
);
console.log(
  'display-space mean abs diff (combined):',
  meanAbsDiff(combinedShipped, combinedUp, n * 3).toFixed(3)
);

for (const c of crops) {
  for (const [label, buf] of [
    ['shipped', combinedShipped],
    ['upscaled', combinedUp],
    ['shipped-fill', fillShippedDisp.data],
    ['upscaled-fill', fillUpDisp.data],
  ]) {
    await sharp(buf, { raw: { width: DISPLAY_W, height: DISPLAY_H, channels: 3 } })
      .extract({ left: c.x, top: c.y, width: c.size, height: c.size })
      .resize(c.size * 2, c.size * 2, { kernel: 'nearest' })
      .webp({ quality: 92 })
      .toFile(join(IDEA_DIR, `${c.name}-${label}-2x.webp`));
  }
}
console.log('crops written to', IDEA_DIR);
