// Idea #17 visualization helpers: night composite render + drift-pixel overlay.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';
import { dilateMask, erodeMask } from './lib/morphology.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const [mode, rel, file, out] = process.argv.slice(2);
if (mode === 'composite') {
  const chalk = await readFile(join(COLORING_DIR, `${rel}.chalk.webp`));
  const fill = await readFile(file);
  await sharp(await compositeNight(fill, chalk)).webp({ quality: 90 }).toFile(out);
  console.log('wrote', out);
} else if (mode === 'drift') {
  const DRIFT_W = 512, DRIFT_SRC_DARK = 110, DRIFT_DILATE = 6, DRIFT_THIN = 3;
  const DRIFT_LUMA_WHITE = 185, DRIFT_CHROMA_MAX = 45;
  const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
  const source = await readFile(chalkPath);
  const s = await sharp(source).resize(DRIFT_W, null, { fit: 'inside' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const t = await sharp(await readFile(file)).resize(DRIFT_W, null, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = s.info.width, h = s.info.height, n = w * h;
  const outline = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (s.data[i] < DRIFT_SRC_DARK) outline[i] = 1;
  const allowed = dilateMask(outline, w, h, DRIFT_DILATE);
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = t.data[i * 3], g = t.data[i * 3 + 1], b = t.data[i * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w, h, DRIFT_THIN), w, h, DRIFT_THIN);
  const rgba = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const drifted = white[i] && !blobs[i] && !allowed[i];
    rgba[i * 3] = drifted ? 255 : t.data[i * 3] >> 1;
    rgba[i * 3 + 1] = drifted ? 0 : t.data[i * 3 + 1] >> 1;
    rgba[i * 3 + 2] = drifted ? 0 : t.data[i * 3 + 2] >> 1;
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 3 } }).png().toFile(out);
  console.log('wrote', out);
}
