import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import { prepareOutlineAnalysis } from '../tools/asset-gen/lib/outline-analysis.mjs';
import { OUTLINE_INK_CUTOFF } from '../tools/asset-gen/lib/outline-match.mjs';
import { OUTLINE_LUMA_THRESHOLD } from '../tools/asset-gen/lib/punch-fill.mjs';

const COLORING = 'web/static/coloring';
const OUT = 'viz/out';
const PAGES = ['farm/cow-wide', 'nature/ladybug-wide', 'vehicles/train-wide'];
const T = 330;
const fit = (b) => sharp(b).resize(T, T, { fit: 'inside' }).png().toBuffer();
const png = (b, w, h, c = 3) => sharp(b, { raw: { width: w, height: h, channels: c } }).png().toBuffer();

const panels = [];
for (const page of PAGES) {
  const buf = await readFile(join(COLORING, `${page}.outline.webp`));
  const a = await prepareOutlineAnalysis(buf);
  const { ink, luma: lumas, w, h } = a;
  const n = w * h;
  const inkPng = Buffer.alloc(n * 3);
  let inkN = 0;
  for (let p = 0; p < n; p++) { if (ink[p]) inkN++; const c = ink[p] ? [255, 209, 102] : [16, 20, 28]; inkPng[p * 3] = c[0]; inkPng[p * 3 + 1] = c[1]; inkPng[p * 3 + 2] = c[2]; }
  const lumaPng = Buffer.alloc(n);
  for (let p = 0; p < n; p++) lumaPng[p] = lumas[p];
  // where the fenced libvips channel would call "ink" at its own cutoff
  const fenced = Buffer.alloc(n * 3);
  let fN = 0;
  for (let p = 0; p < n; p++) { const on = lumas[p] < OUTLINE_INK_CUTOFF; if (on) fN++; const c = on ? [88, 166, 255] : [16, 20, 28]; fenced[p * 3] = c[0]; fenced[p * 3 + 1] = c[1]; fenced[p * 3 + 2] = c[2]; }
  panels.push(
    { png: await fit(await sharp(buf).removeAlpha().png().toBuffer()), label: `${page}.outline.webp`, sub: 'one file feeds BOTH paths below' },
    { png: await fit(await png(inkPng, w, h)), label: `ink[] — luma() < ${OUTLINE_LUMA_THRESHOLD}`, sub: `MOVED to the shared helper · ${(inkN / n * 100).toFixed(1)}% of pixels`, color: '#ffd166' },
    { png: await fit(await png(lumaPng, w, h, 1)), label: 'analysis.luma — libvips channel', sub: 'FENCED, untouched by this PR' },
    { png: await fit(await png(fenced, w, h)), label: `that channel < ${OUTLINE_INK_CUTOFF}`, sub: `what chalk-ink-diff thresholds · ${(fN / n * 100).toFixed(1)}% of pixels`, color: '#58a6ff' },
  );
}
await grid({
  title: 'Gate B — outline-analysis.mjs, the split-personality file',
  subtitle: 'decodeOutline() produces two products from one image. The yellow ink[] mask is the one this PR moved onto luma(); the greyscale channel beside it is the libvips conversion that chalk-ink-diff.mjs thresholds with OUTLINE_INK_CUTOFF, and the PR deliberately left it alone (that is the comment fence added in the diff). Two masks, two conversions, one file.',
  panels, cols: 4, cell: 330, out: `${OUT}/B1-outline.png`,
});
console.log('done');
