import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { analyzePage, paint, grid, toPng } from './viz-lib.mjs';
import { compositeNight } from '/home/user/Splotch/tools/asset-gen/lib/night-composite.mjs';

const results = JSON.parse(await readFile('/tmp/claude-0/-home-user-Splotch/dac8fce1-adde-5681-9d1f-eb61e4f6487e/scratchpad/halo/audit.json', 'utf8'));
results.sort((a, b) => b.haloScore - a.haloScore);
const picks = [7, 8, 9, 11, 12, 15, 21, 29, 41, 55, 70, 95].map((i) => results[i]);
const W = 250, H = 300;
const cells = [];
for (const r of picks) {
  const a = await analyzePage(r.page);
  const compBuf = await compositeNight(await toPng({ rgb: a.shipped, w: a.w, h: a.h }), a.chalk ?? a.lineArt);
  const c = await sharp(compBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const marked = paint(c.data, a.w, a.h, [{ mask: a.halo, color: [255, 40, 190] }]);
  const buf = await sharp(Buffer.from(marked), { raw: { width: a.w, height: a.h, channels: 3 } })
    .resize(W, H, { fit: 'contain', background: '#faf7f2' }).png().toBuffer();
  cells.push({ buf, caption: [`${r.page}`, `halo ${r.haloScore} · ${a.haloPx12} px counted`] });
  console.log(r.page, r.haloScore);
}
await writeFile('out/fig5-clean.png', await grid({
  cells, cols: 4, cellW: 300, cellH: H, capSize: 17,
  title: '5 · The other 89 pages — a 12-page spread of what "passing" looks like',
  subtitle: ['Same magenta overlay, same scale — pages the gate lets through, sampled from rank 8 (the highest passer) to rank 96.',
    'Blast radius: all 96 shipped night pages were re-scored. The 77 not shown here are the rest of creatures, dinosaur, farm,',
    'nature, objects, shapes, space and vehicles; every one scores below 1.26 and 73 of 96 score below 0.2.'],
}));
console.log('fig5 ok');
