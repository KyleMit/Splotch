import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { zoomCrop, svgLabel, stack, findEdgyCrop } from './lib.mjs';
import { nearInkPaperMask, paperDirt, dirtMap, encodeQ } from './lib2.mjs';

const file = process.argv[2];
const title = process.argv[3];
const outName = process.argv[4];
const WIN = 190, ZOOM = 4;

const src = await sharp(file).png().toBuffer();
const { mask, info } = await nearInkPaperMask(src);
const crop = await findEdgyCrop(file, WIN);

const cells = [
  await stack([
    svgLabel(WIN * ZOOM, 60, ['the art', { t: 'black ink, white paper', size: 15, weight: 400, fg: '#6b7280' }], { size: 19 }),
    await zoomCrop(src, { ...crop, factor: ZOOM }),
  ]),
];
for (const q of [92, 90, 75]) {
  const enc = await encodeQ(src, q);
  const stat = await paperDirt(enc, mask);
  const map = await dirtMap(src, enc, mask, info);
  cells.push(await stack([
    svgLabel(WIN * ZOOM, 60, [
      `q${q}`,
      { t: `${stat.dirtyPct.toFixed(1)}% of paper dirtied · worst ${stat.worst}/255 · ${(enc.length / 1024).toFixed(0)} KB`, size: 15, weight: 400, fg: '#6b7280' },
    ], { size: 19, fg: q === 92 ? '#166534' : q === 90 ? '#92400e' : '#991b1b' }),
    await zoomCrop(map, { ...crop, factor: ZOOM }),
  ]));
}
const head = svgLabel(WIN * ZOOM * 4 + 36, 52, [title], { size: 23, bg: '#f3f4f6' });
await writeFile(`.viz/out/${outName}`, await stack([head, await stack(cells, { gap: 12, dir: 'h' })], { gap: 10, bg: '#e5e7eb' }));
console.log('wrote', outName);
