// IDEAS.md #7 — before/after composite crops at the same view: shipped punch vs
// idea #1 rim-erased punch (applied UNGATED here), for the regression-gate demo.
// To run: copy into tools/asset-gen/, then from repo root:
//   node tools/asset-gen/halo-before-after.mjs <page> <left> <top> <box> <outPrefix>
import { join } from 'node:path';
import sharp from 'sharp';
import { dilateMask } from './lib/morphology.mjs';
import { compositeNight } from './lib/night-composite.mjs';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const PUNCH_LUMA = 150;
const RIM_R = 2;
const RIM_DARK = 145;
const RIM_PROTECT_BLACK = 55;

const [page, leftArg, topArg, boxArg, outPrefix] = process.argv.slice(2);
const box = Number(boxArg);

const rawPath = join(FILL_SRC_DIR, `${page}.night.raw.webp`);
const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
const shippedPath = join(COLORING_DIR, `${page}.night.webp`);

const {
  data: fill,
  info: { width, height },
} = await sharp(rawPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: line } = await sharp(chalkPath)
  .removeAlpha()
  .resize(width, height, { fit: 'fill' })
  .raw()
  .toBuffer({ resolveWithObject: true });
const mask = new Uint8Array(width * height);
for (let p = 0, i = 0; p < width * height; p++, i += 3) {
  const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
  if (luma < PUNCH_LUMA) mask[p] = 1;
}

const grown = dilateMask(mask, width, height, RIM_R);
for (let p = 0; p < width * height; p++) {
  if (!grown[p] || mask[p]) continue;
  const luma = 0.299 * fill[p * 3] + 0.587 * fill[p * 3 + 1] + 0.114 * fill[p * 3 + 2];
  if (luma >= RIM_PROTECT_BLACK && luma < RIM_DARK) mask[p] = 1;
}
// bleed (verbatim lib/punch-fill.mjs)
{
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < width * height; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || pending[q]) continue;
        r += fill[q * 3];
        g += fill[q * 3 + 1];
        b += fill[q * 3 + 2];
        n++;
      }
      if (!n) {
        next.push(p);
        continue;
      }
      fill[p * 3] = Math.round(r / n);
      fill[p * 3 + 1] = Math.round(g / n);
      fill[p * 3 + 2] = Math.round(b / n);
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
}
const erasedWebp = await sharp(fill, { raw: { width, height, channels: 3 } })
  .webp({ quality: 95 })
  .toBuffer();

const left = Math.max(0, Math.min(width - box, Number(leftArg)));
const top = Math.max(0, Math.min(height - box, Number(topArg)));
const scale = Math.max(1, Math.floor(560 / box));
for (const [label, fillSrc] of [
  ['before', shippedPath],
  ['after', erasedWebp],
]) {
  const png = await compositeNight(fillSrc, chalkPath);
  await sharp(png)
    .extract({ left, top, width: box, height: box })
    .resize(box * scale, box * scale, { kernel: 'nearest' })
    .webp({ quality: 90, effort: 5 })
    .toFile(`${outPrefix}.${label}.webp`);
  console.log(`${outPrefix}.${label}.webp`);
}
