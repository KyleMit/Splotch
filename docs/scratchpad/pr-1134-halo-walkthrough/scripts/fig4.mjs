import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { analyzePage, paint, crop, grid, toPng } from './viz-lib.mjs';
import { compositeNight } from '/home/user/Splotch/tools/asset-gen/lib/night-composite.mjs';

const pages = [
  ['shapes/rectangle-tall', 4.3], ['shapes/heart-tall', 3.2], ['nature/spider-tall', 2.8],
  ['objects/house-tall', 2.5], ['vehicles/fire-tall', 2.5], ['objects/house-wide', 2.3], ['space/station-tall', 2.1],
];
const THUMB_W = 210, THUMB_H = 270, CROP = 130, Z = 2, CELL_W = THUMB_W + 10 + CROP * Z, CELL_H = Math.max(THUMB_H, CROP * Z);
const cells = [];
for (const [page, ceiling] of pages) {
  const a = await analyzePage(page);
  const compBuf = await compositeNight(await toPng({ rgb: a.shipped, w: a.w, h: a.h }), a.chalk ?? a.lineArt);
  const c = await sharp(compBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const marked = paint(c.data, a.w, a.h, [{ mask: a.halo, color: [255, 40, 190] }]);
  const hs = a.hotspots[0];
  const box = { left: hs.left + 32 - CROP / 2, top: hs.top + 32 - CROP / 2, width: CROP, height: CROP };
  const thumb = await sharp(compBuf).resize(THUMB_W, THUMB_H, { fit: 'contain', background: '#faf7f2' }).png().toBuffer();
  const cropBuf = await crop(marked, a.w, a.h, box, Z);
  const cell = await sharp({ create: { width: CELL_W, height: CELL_H, channels: 3, background: '#faf7f2' } })
    .composite([{ input: thumb, left: 0, top: Math.round((CELL_H - THUMB_H) / 2) }, { input: cropBuf, left: THUMB_W + 10, top: 0 }])
    .png().toBuffer();
  cells.push({ buf: cell, caption: [`${page} · halo ${a.haloScore} → ceiling ${ceiling}`, `rawScore ${a.rawScore}${a.rawScore > 5 ? ' → crop review' : ''}`] });
  console.log(page, a.haloScore, hs);
}
await writeFile('out/fig4-exceptions.png', await grid({
  cells, cols: 3, cellW: CELL_W, cellH: CELL_H, capSize: 17,
  title: '4 · The seven ceilings — what got judged deliberate rather than broken',
  subtitle: ['Left of each pair: the shipped page as a child sees it. Right: its worst halo tile at 2x, magenta = counted pixels.',
    'Each ceiling is stored per page in notes.json with a review note; the strict default of 2 still guards every other page.'],
}));
console.log('fig4 ok');
