import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { crop, grid, paint } from './viz-lib.mjs';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt } from '/home/user/Splotch/tools/asset-gen/lib/asset-paths.mjs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import { bleedUnderMask, OUTLINE_LUMA_THRESHOLD } from '/home/user/Splotch/tools/asset-gen/lib/punch-fill.mjs';
import { compositeNight } from '/home/user/Splotch/tools/asset-gen/lib/night-composite.mjs';

const page = 'farm/duck-tall';
const raw = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
const { source: lineArt, chalk } = await resolveNightLineArt(join(COLORING_DIR, `${page}.outline.webp`));
const { data: fill, info } = await sharp(raw).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const { data: line } = await sharp(lineArt).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
const mask = new Uint8Array(w * h);
for (let p = 0, i = 0; p < w * h; p++, i += 3)
  if (0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2] < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;

const shadowBand = dilateMask(mask, w, h, 3);
const doctored = Buffer.from(fill);
for (let p = 0; p < w * h; p++) {
  if (!shadowBand[p] || mask[p]) continue;
  for (let c = 0; c < 3; c++) doctored[p * 3 + c] = Math.round(doctored[p * 3 + c] * 0.25 + 105 * 0.75);
}
const punchOf = (src) => { const b = Buffer.from(src); bleedUnderMask(b, mask, w, h); return b; };
const refOf = (src) => { const b = Buffer.from(src); bleedUnderMask(b, dilateMask(mask, w, h, 4), w, h); return b; };
const lum = (b, p) => 0.299 * b[p * 3] + 0.587 * b[p * 3 + 1] + 0.114 * b[p * 3 + 2];
function haloMask(src) {
  const shipped = punchOf(src), ref = refOf(src);
  let prev = mask; const m = new Uint8Array(w * h);
  for (let d = 1; d <= 2; d++) {
    const grown = dilateMask(prev, w, h, 1);
    for (let p = 0; p < w * h; p++) {
      if (!grown[p] || prev[p]) continue;
      const l = lum(shipped, p);
      if (lum(ref, p) - l > 40 && l >= 55 && l < 145) m[p] = 1;
    }
    prev = grown;
  }
  return { m, shipped };
}
const clean = haloMask(fill), bad = haloMask(doctored);
const compOf = async (buf) => {
  const png = await sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const c = await sharp(await compositeNight(png, chalk ?? lineArt)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return c.data;
};
const cleanComp = await compOf(clean.shipped), badComp = await compOf(bad.shipped);
const box = { left: 250, top: 430, width: 150, height: 150 }, Z = 3;
const TW = 300, TH = box.height * Z;
const thumb = async (buf) => sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: 3 } })
  .resize(TW, TH, { fit: 'contain', background: '#faf7f2' }).png().toBuffer();
const cells = [
  { buf: await thumb(cleanComp), caption: ['A · whole page on screen', 'shipped farm/duck-tall'] },
  { buf: await crop(fill, w, h, box, Z), caption: ['A · the shipped take (raw)', 'candidate as the model returned it'] },
  { buf: await crop(clean.shipped, w, h, box, Z), caption: ['A punched — what the gate scores', 'halo 0.016 · drift 0.0000 · lineW 253'] },
  { buf: await crop(paint(cleanComp, w, h, [{ mask: clean.m, color: [255, 40, 190] }]), w, h, box, Z), caption: ['A on screen · ACCEPTED', 'exit 0'] },
  { buf: await thumb(badComp), caption: ['B · whole page on screen', 'grey shadow along every line'] },
  { buf: await crop(doctored, w, h, box, Z), caption: ['B · same take + 3px drop shadow', 'the failure class this PR is about'] },
  { buf: await crop(bad.shipped, w, h, box, Z), caption: ['B punched — grey rim survives', 'halo 4.075 · drift 0.0000 · lineW 252'] },
  { buf: await crop(paint(badComp, w, h, [{ mask: bad.m, color: [255, 40, 190] }]), w, h, box, Z), caption: ['B on screen · REJECTED', 'halo-gate FAILED, exit 1'] },
];
await writeFile('out/fig7-demo.png', await grid({
  cells, cols: 4, cellW: Math.max(TW, box.width * Z), cellH: box.height * Z, capSize: 18,
  title: '7 · Does the gate actually stop it? — farm/duck-tall, run through the real CLI',
  subtitle: ['Row A is the shipped take. Row B is the same take with a mid-dark shadow painted along its own outlines —',
    'the excavator/train failure class, synthesised so it can be replayed offline through the real CLI.',
    'Every older gate reads them as the same page (drift 0.0000 both, bgLuma 27 both, lineW 253 vs 252). Only halo separates them.'],
}));
console.log('fig7 ok');
