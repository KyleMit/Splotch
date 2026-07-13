// EXPERIMENT (idea #9) — side-by-side tall|wide evidence image.
//   node tools/asset-gen/make-pair-image.mjs <base> <mode> <out.webp> [--wide-file <path>]
import sharp from 'sharp';
import { join } from 'node:path';
import { FILL_SRC_DIR } from './lib/paths.mjs';

const [base, mode, out] = process.argv.slice(2, 5);
const wideFileIdx = process.argv.indexOf('--wide-file');
const H = 400;
const tall = join(FILL_SRC_DIR, `${base}-tall.${mode}.raw.webp`);
const wide = wideFileIdx > 0 ? process.argv[wideFileIdx + 1] : join(FILL_SRC_DIR, `${base}-wide.${mode}.raw.webp`);
const t = await sharp(tall).resize(null, H).toBuffer({ resolveWithObject: true });
const w = await sharp(wide).resize(null, H).toBuffer({ resolveWithObject: true });
const gap = 12;
const totalW = t.info.width + gap + w.info.width;
const composite = sharp({
  create: { width: totalW, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
}).composite([
  { input: t.data, left: 0, top: 0 },
  { input: w.data, left: t.info.width + gap, top: 0 },
]);
const buf = await composite.webp({ quality: 82 }).toBuffer();
const meta = await sharp(buf).metadata();
const long = Math.max(meta.width, meta.height);
const final = long > 560 ? await sharp(buf).resize(Math.round((meta.width * 560) / long)).webp({ quality: 82 }).toBuffer() : buf;
await sharp(final).toFile(out);
console.log(out, (await sharp(final).metadata()).width, 'x', (await sharp(final).metadata()).height);
