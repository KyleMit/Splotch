// TEMP (idea #15): per-region mean-color inpaint punch, as an alternative to
// lib/punch-fill.mjs's nearest-bleed. Segments the non-masked fill into 4-connected
// regions, computes each region's mean color, then labels every masked pixel with
// its nearest region (multi-source ring peel, same order as bleedUnderMask) and
// paints it with the region MEAN instead of the local neighbor average.
// Writes shipped-equivalent webp + same-spot crops to IDEA15_OUT. Repo untouched.
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const OUT_DIR = process.env.IDEA15_OUT;
if (!OUT_DIR) throw new Error('set IDEA15_OUT');
const OUTLINE_LUMA_THRESHOLD = 150;
const WEBP_QUALITY = 85;
const WEBP_EFFORT = 6;

export function regionMeanInpaint(rgb, mask, width, height) {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const sums = [];
  const stack = [];
  let nextLabel = 0;
  for (let seed = 0; seed < n; seed++) {
    if (mask[seed] || label[seed] !== -1) continue;
    const lab = nextLabel++;
    sums.push([0, 0, 0, 0]);
    stack.length = 0;
    stack.push(seed);
    label[seed] = lab;
    while (stack.length) {
      const p = stack.pop();
      const s = sums[lab];
      s[0] += rgb[p * 3];
      s[1] += rgb[p * 3 + 1];
      s[2] += rgb[p * 3 + 2];
      s[3]++;
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= n || mask[q] || label[q] !== -1) continue;
        label[q] = lab;
        stack.push(q);
      }
    }
  }
  const mean = new Uint8Array(nextLabel * 3);
  for (let l = 0; l < nextLabel; l++) {
    const [r, g, b, c] = sums[l];
    mean[l * 3] = Math.round(r / c);
    mean[l * 3 + 1] = Math.round(g / c);
    mean[l * 3 + 2] = Math.round(b / c);
  }
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < n; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let lab = -1;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= n || pending[q]) continue;
        lab = label[q];
        break;
      }
      if (lab === -1) {
        next.push(p);
        continue;
      }
      label[p] = lab;
      rgb[p * 3] = mean[lab * 3];
      rgb[p * 3 + 1] = mean[lab * 3 + 1];
      rgb[p * 3 + 2] = mean[lab * 3 + 2];
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
  return nextLabel;
}

async function punchRegionMean(spec) {
  const [cat, rest] = [spec.split('/')[0], spec.split('/')[1]];
  const m = rest.match(/^(.+)\.(light|night)$/);
  const page = m[1];
  const theme = m[2];
  const rawPath = join(FILL_SRC_DIR, cat, `${page}.${theme}.raw.webp`);
  const penPath = join(COLORING_DIR, cat, `${page}.outline.webp`);
  const chalkPath = join(COLORING_DIR, cat, `${page}.chalk.webp`);
  const linePath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;
  const {
    data: fill,
    info: { width, height },
  } = await sharp(await readFile(rawPath))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: line } = await sharp(await readFile(linePath))
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  const t0 = Date.now();
  const regions = regionMeanInpaint(fill, mask, width, height);
  const ms = Date.now() - t0;
  const slug = spec.replace(/[/.]/g, '-');
  const out = join(OUT_DIR, `${slug}.regionmean.webp`);
  await sharp(fill, { raw: { width, height, channels: 3 } })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toFile(out);
  console.log(`${spec}: ${regions} regions, inpaint ${ms}ms -> ${out}`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const spec of process.argv.slice(2)) await punchRegionMean(spec);
