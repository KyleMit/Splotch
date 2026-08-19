// Build two offline candidates for the --rescore demo: the shipped take, and the
// same take with a mid-dark drop shadow painted along its own outlines.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, SAMPLES_DARK_DIR, resolveNightLineArt } from '/home/user/Splotch/tools/asset-gen/lib/asset-paths.mjs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import { OUTLINE_LUMA_THRESHOLD } from '/home/user/Splotch/tools/asset-gen/lib/punch-fill.mjs';

const page = process.argv[2];
const raw = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
const { source: lineArt } = await resolveNightLineArt(join(COLORING_DIR, `${page}.outline.webp`));
const { data: fill, info } = await sharp(raw).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const { data: line } = await sharp(lineArt).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
const mask = new Uint8Array(w * h);
for (let p = 0, i = 0; p < w * h; p++, i += 3)
  if (0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2] < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
const shadow = dilateMask(mask, w, h, 3);
const doctored = Buffer.from(fill);
const SHADOW_LUMA = 105;
for (let p = 0; p < w * h; p++) {
  if (!shadow[p] || mask[p]) continue;
  for (let c = 0; c < 3; c++) doctored[p * 3 + c] = Math.round(doctored[p * 3 + c] * 0.25 + SHADOW_LUMA * 0.75);
}
const dir = join(SAMPLES_DARK_DIR, dirname(page));
await mkdir(dir, { recursive: true });
const enc = (buf) => sharp(buf, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 90 }).toBuffer();
await writeFile(join(SAMPLES_DARK_DIR, `${page}.webp`), await enc(process.argv[3] === 'doctored' ? doctored : fill));
console.log('wrote', join(SAMPLES_DARK_DIR, `${page}.webp`), process.argv[3] ?? 'clean');
