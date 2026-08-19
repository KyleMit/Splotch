import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { encodeQ, midtoneFraction, zoomCrop, ampDiff, svgLabel, stack, findEdgyCrop } from './lib.mjs';

const CASES = [
  { file: 'web/static/coloring/creatures/unicorn-tall.chalk.webp', kind: 'HARD EDGE — chalk outline (q92)', tag: 'chalk' },
  { file: 'tools/asset-gen/fill-src/creatures/owl-wide.light.raw.webp', kind: 'SOFT PAINT — light fill (q90)', tag: 'light-fill' },
];
const WIN = 150, ZOOM = 4, GAIN = 8;

const rows = [];
for (const c of CASES) {
  const src = await sharp(c.file).png().toBuffer();
  const crop = await findEdgyCrop(c.file, WIN);
  const hi = await encodeQ(src, 92);
  const lo = await encodeQ(src, 50);
  const cells = [];
  for (const [name, buf] of [['source (lossless)', src], ['re-encoded q92', hi], ['re-encoded q50', lo]]) {
    const z = await zoomCrop(await sharp(buf).png().toBuffer(), { ...crop, factor: ZOOM });
    cells.push(await stack([svgLabel(WIN * ZOOM, 34, [name], { size: 17 }), z]));
  }
  const d = await ampDiff(src, lo, GAIN);
  const dz = await zoomCrop(d, { ...crop, factor: ZOOM });
  cells.push(await stack([svgLabel(WIN * ZOOM, 34, [`error vs q50 (x${GAIN})`], { size: 17 }), dz]));
  const mSrc = await midtoneFraction(src), mHi = await midtoneFraction(hi), mLo = await midtoneFraction(lo);
  console.log(`${c.tag}: midtone src ${(mSrc*100).toFixed(2)}%  q92 ${(mHi*100).toFixed(2)}%  q50 ${(mLo*100).toFixed(2)}%`);
  const head = svgLabel(WIN * ZOOM * 4 + 30, 44, [c.kind], { size: 22, bg: '#f3f4f6' });
  rows.push(await stack([head, await stack(cells, { gap: 10, dir: 'h' })], { gap: 8 }));
}
await writeFile('.viz/out/e1-ringing.png', await stack(rows, { gap: 22, bg: '#e5e7eb' }));
console.log('wrote e1');
