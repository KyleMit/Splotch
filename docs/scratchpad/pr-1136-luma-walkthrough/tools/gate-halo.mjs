import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import { luma } from '../tools/asset-gen/lib/image-stats.mjs';
import { dilateMask } from '../tools/asset-gen/lib/morphology.mjs';
import { bleedUnderMask, OUTLINE_LUMA_THRESHOLD } from '../tools/asset-gen/lib/punch-fill.mjs';
import { prepareNightAnalysis, sourceRgbAt } from '../tools/asset-gen/lib/night-analysis.mjs';
import { scoreNightHalo, DELTA_RIM, HALO_DARK, HALO_PROTECT_BLACK } from '../tools/asset-gen/lib/night-halo.mjs';
import { resolveNightLineArt } from '../tools/asset-gen/lib/asset-paths.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const OUT = 'viz/out';
const REF_DILATE = 4;
const png = (b, w, h, c = 3) => sharp(b, { raw: { width: w, height: h, channels: c } }).png().toBuffer();

const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['vehicles/train-wide', 'objects/teddy-wide', 'creatures/dragon-wide'];

const panels = [];
for (const page of PAGES) {
  const raw = await readFile(join(FILLSRC, `${page}.night.raw.webp`));
  const pen = await readFile(join(COLORING, `${page}.outline.webp`));
  const { source } = await resolveNightLineArt(join(COLORING, `${page}.outline.webp`), pen);
  const shipped = await readFile(join(COLORING, `${page}.night.webp`));
  const analysis = await prepareNightAnalysis(raw, source ?? pen);
  const score = await scoreNightHalo(analysis, shipped);
  const { rgb: rawRgb, width: w, height: h } = analysis.fill;
  const { data: line } = await sourceRgbAt(analysis, w, h);
  const n = w * h;
  const mask = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 3) if (luma(line[i], line[i + 1], line[i + 2]) < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  const refRgb = Buffer.from(rawRgb);
  bleedUnderMask(refRgb, dilateMask(mask, w, h, REF_DILATE), w, h);
  const { data: ship } = await sharp(shipped).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  // ring bands 1..2 around the punch mask
  let prev = mask;
  const band = new Uint8Array(n);
  for (let d = 1; d <= 2; d++) {
    const grown = dilateMask(prev, w, h, 1);
    for (let p = 0; p < n; p++) if (grown[p] && !prev[p]) band[p] = 1;
    prev = grown;
  }
  const L = (buf, p) => luma(buf[p * 3], buf[p * 3 + 1], buf[p * 3 + 2]);
  const delta = Buffer.alloc(n * 3);
  const cls = Buffer.alloc(n * 3);
  let halo = 0, bandN = 0;
  for (let p = 0; p < n; p++) {
    const d = L(refRgb, p) - L(ship, p);
    const v = Math.max(0, Math.min(255, Math.round(d * 3)));
    delta[p * 3] = v; delta[p * 3 + 1] = Math.round(v * 0.45); delta[p * 3 + 2] = Math.round(v * 0.2);
    let c = [16, 20, 28];
    if (mask[p]) c = [40, 46, 58];
    else if (band[p]) {
      bandN++;
      const l = L(ship, p);
      const isHalo = d > DELTA_RIM && l >= HALO_PROTECT_BLACK && l < HALO_DARK;
      if (isHalo) { halo++; c = [255, 40, 60]; } else c = [70, 120, 90];
    }
    cls[p * 3] = c[0]; cls[p * 3 + 1] = c[1]; cls[p * 3 + 2] = c[2];
  }
  const T = 340;
  const fit = (b) => sharp(b).resize(T, T, { fit: 'inside' }).png().toBuffer();
  panels.push(
    { png: await fit(await png(ship, w, h)), label: `${page} shipped night`, sub: 'what the app actually paints' },
    { png: await fit(await png(refRgb, w, h)), label: 'reference punch', sub: 'mask dilated 4px, then bled — "clean" fill' },
    { png: await fit(await png(delta, w, h)), label: 'rimΔ = luma(ref) − luma(shipped)', sub: 'two luma() calls subtracted, ×3 gain', color: '#ffd166' },
    { png: await fit(await png(cls, w, h)), label: `haloScore = ${score.haloScore}`, sub: `red = halo px in rings 1-2 (${halo}/${bandN}) · bar: <= 2`, color: score.haloScore <= 2 ? '#7ee787' : '#ff7b72' },
  );
}
await grid({
  title: 'Gate E — night-halo.mjs',
  subtitle: `Rebuilds the punch mask with luma() < ${OUTLINE_LUMA_THRESHOLD}, then measures rimΔ — one luma() reading of the reference minus one of the shipped fill — in the 1-2px rings hugging every stroke. A pixel counts as halo when rimΔ > ${DELTA_RIM} and the shipped luma sits in the mid-dark window [${HALO_PROTECT_BLACK}, ${HALO_DARK}). Every number on this row is a luma() call.`,
  panels, cols: 4, cell: 340, out: `${OUT}/F1-halo.png`,
});
console.log('done');
