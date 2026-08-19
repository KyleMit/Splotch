import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import { maskPng } from './lib.mjs';
import { luma } from '../tools/asset-gen/lib/image-stats.mjs';
import { OUTLINE_LUMA_THRESHOLD } from '../tools/asset-gen/lib/punch-fill.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const OUT = 'viz/out';
const T = 320;

async function punchMask(lineArtPath, w, h) {
  const { data } = await sharp(await readFile(lineArtPath)).removeAlpha()
    .resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let p = 0, i = 0; p < w * h; p++, i += 3)
    if (luma(data[i], data[i + 1], data[i + 2]) < OUTLINE_LUMA_THRESHOLD) { mask[p] = 1; n++; }
  return { mask, frac: n / (w * h) };
}
const fit = (buf, t = T) => sharp(buf).resize(t, t, { fit: 'inside' }).png().toBuffer();

const TRI = ['creatures/dragon-wide', 'farm/cow-wide', 'nature/ladybug-wide'];
const panels = [];
for (const page of TRI) {
  const lineArt = join(COLORING, `${page}.outline.webp`);
  const raw = join(FILLSRC, `${page}.light.raw.webp`);
  const shipped = join(COLORING, `${page}.light.webp`);
  const meta = await sharp(await readFile(shipped)).metadata();
  const { mask, frac } = await punchMask(lineArt, meta.width, meta.height);
  panels.push(
    { png: await fit(await readFile(raw)), label: 'a. raw model fill', sub: 'fill-src *.raw.webp' },
    { png: await fit(await readFile(lineArt)), label: 'b. line art (gate input)', sub: '*.outline.webp' },
    { png: await fit(await maskPng(mask, meta.width, meta.height, [0, 0, 0], [255, 255, 255])), label: 'c. luma(r,g,b) < 150', sub: `black = punch · ${(frac * 100).toFixed(1)}%` },
    { png: await fit(await readFile(shipped)), label: 'd. shipped fill', sub: `${page} — lines dissolved`, color: '#7ee787' },
  );
}
await grid({
  title: 'Gate A — punch-fill.mjs',
  subtitle: 'luma(line art) < 150 marks a pixel as "outline", then that pixel is inpainted from its neighbours. Watch the black lines vanish between (a) and (d).',
  panels, cols: 4, cell: 300, out: `${OUT}/A1-punch-triptych.png`,
});

// zoom crop: raw vs shipped, same window
const zpage = 'farm/cow-wide';
const zmeta = await sharp(await readFile(join(COLORING, `${zpage}.light.webp`))).metadata();
const cw = Math.round(zmeta.width * 0.26), ch = Math.round(zmeta.height * 0.34);
const cx = Math.round(zmeta.width * 0.36), cy = Math.round(zmeta.height * 0.28);
const crop = async (p) => sharp(await readFile(p)).extract({ left: cx, top: cy, width: cw, height: ch })
  .resize(460, null, { kernel: 'nearest' }).png().toBuffer();
const { mask: zmask } = await punchMask(join(COLORING, `${zpage}.outline.webp`), zmeta.width, zmeta.height);
const zmaskPng = await maskPng(zmask, zmeta.width, zmeta.height, [0, 0, 0], [255, 255, 255]);
await grid({
  title: 'Gate A, zoomed — cow head, 26% crop',
  subtitle: 'Same pixels, three stages. The mask (middle) is exactly the black ink the gate erased.',
  panels: [
    { png: await crop(join(FILLSRC, `${zpage}.light.raw.webp`)), label: 'raw fill: model drew its own lines', sub: '' },
    { png: await sharp(zmaskPng).extract({ left: cx, top: cy, width: cw, height: ch }).resize(460, null, { kernel: 'nearest' }).png().toBuffer(), label: 'punch mask from luma < 150', sub: '' },
    { png: await crop(join(COLORING, `${zpage}.light.webp`)), label: 'shipped: lines inpainted away', sub: '', color: '#7ee787' },
  ], cols: 3, cell: 460, out: `${OUT}/A2-punch-zoom.png`,
});

const SAMPLE12 = ['creatures/dragon-wide', 'dinosaur/trex-wide', 'farm/cow-wide', 'nature/ladybug-wide',
  'objects/apple-wide', 'space/ship-wide', 'vehicles/train-wide', 'shapes/star-wide',
  'creatures/unicorn-tall', 'farm/duck-tall', 'nature/bee-tall', 'objects/balloon-tall'];
const sp = [];
for (const page of SAMPLE12) {
  const meta = await sharp(await readFile(join(COLORING, `${page}.light.webp`))).metadata();
  const { mask, frac } = await punchMask(join(COLORING, `${page}.outline.webp`), meta.width, meta.height);
  sp.push({ png: await fit(await maskPng(mask, meta.width, meta.height, [0, 0, 0], [255, 255, 255]), 250), label: page, sub: `punched ${(frac * 100).toFixed(1)}%` });
}
await grid({ title: 'Gate A blast radius — 12 of 192 fills', subtitle: 'Every shipped *.light.webp and *.night.webp gets its inpaint mask from this one expression.',
  panels: sp, cols: 4, cell: 250, out: `${OUT}/A3-punch-sample12.png` });
console.log('done');
