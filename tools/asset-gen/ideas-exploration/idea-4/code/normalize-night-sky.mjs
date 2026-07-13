// IDEA #4 experiment (temporary — delete before finishing).
// Deterministic night-sky luma normalization: flood-fill the true background
// region (same machinery as scoreNightness, but at FULL resolution against the
// page's chalk), then multiplicatively scale the region's RGB toward a target
// median luma. Edge handling:
//   - the binary bg mask is feathered (gaussian blur) so the scale factor ramps
//     smoothly at region borders instead of stepping;
//   - bright pixels (the fill's own white outlines + their AA glow, luma>=160)
//     are progressively protected so lines stay white.
// Writes: normalized raw, before/after simulated night composites, and a zoom
// crop pair, into the given out dir. Never touches committed files.
//   node tools/asset-gen/tmp-idea4-normalize.mjs farm/cow-wide /path/out 30
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const SRC_LIGHT = 170; // chalk pixel brighter than this = background candidate
const PROTECT_LO = 160; // fill luma where line-white protection starts
const PROTECT_HI = 220; // fill luma fully protected (kept as-is)
const FEATHER_SIGMA = 2;

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function floodBackground(gray, w, h) {
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && gray[i] > SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return bg;
}

export async function normalizeNightSky(rawBuf, chalkBuf, targetLuma) {
  const {
    data: fill,
    info: { width: w, height: h },
  } = await sharp(rawBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: gray } = await sharp(chalkBuf)
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = w * h;
  const bg = floodBackground(gray, w, h);

  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const L = luma(fill[i * 3], fill[i * 3 + 1], fill[i * 3 + 2]);
    if (L < PROTECT_LO) lumas.push(L); // median of the sky itself, not the line glow
  }
  lumas.sort((a, b) => a - b);
  const median = lumas[lumas.length >> 1];
  const k = Math.min(1, targetLuma / median);

  const feathered = await sharp(Buffer.from(bg.map((v) => v * 255)), {
    raw: { width: w, height: h, channels: 1 },
  })
    .blur(FEATHER_SIGMA)
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  if (feathered.length !== n)
    throw new Error(`feathered mask has ${feathered.length / n}x channels`);

  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const r = fill[i * 3];
    const g = fill[i * 3 + 1];
    const b = fill[i * 3 + 2];
    const m = feathered[i] / 255;
    const L = luma(r, g, b);
    const protect = Math.min(1, Math.max(0, (L - PROTECT_LO) / (PROTECT_HI - PROTECT_LO)));
    const f = 1 - m * (1 - k) * (1 - protect);
    out[i * 3] = Math.round(r * f);
    out[i * 3 + 1] = Math.round(g * f);
    out[i * 3 + 2] = Math.round(b * f);
  }
  return {
    buffer: await sharp(out, { raw: { width: w, height: h, channels: 3 } })
      .webp({ quality: 90 })
      .toBuffer(),
    median,
    k,
    bgFrac: lumas.length / n,
  };
}

const [page, outDir, targetArg] = process.argv.slice(2);
const target = Number(targetArg ?? 30);
const rawPath = join(FILL_SRC_DIR, `${page}.night.raw.webp`);
const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
const raw = await readFile(rawPath);
const chalk = await readFile(chalkPath);
const { buffer, median, k, bgFrac } = await normalizeNightSky(raw, chalk, target);
await mkdir(outDir, { recursive: true });
const slug = page.replace('/', '-');
await sharp(buffer).toFile(join(outDir, `${slug}.normalized.raw.webp`));
await sharp(await compositeNight(raw, chalk)).toFile(join(outDir, `${slug}.before.composite.png`));
await sharp(await compositeNight(buffer, chalk)).toFile(
  join(outDir, `${slug}.after.composite.png`)
);
console.log(JSON.stringify({ page, medianBefore: median, k, bgFrac, target }, null, 2));
