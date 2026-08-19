import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { globSync } from 'node:fs';
import { svgLabel, stack, encodeQ } from './lib.mjs';
import { nearInkPaperMask, paperDirt } from './lib2.mjs';

const [kind, outName] = process.argv.slice(2);
const CATS = ['creatures', 'dinosaur', 'farm', 'nature', 'objects', 'shapes', 'space', 'vehicles'];
const suffix = kind === 'chalk' ? 'chalk' : 'outline';

// One page from each category, then round back for 12 total — a spread, not a cherry-pick.
const picks = [];
for (let round = 0; picks.length < 12; round++)
  for (const c of CATS) {
    const fs = globSync(`web/static/coloring/${c}/*.${suffix}.webp`).sort();
    if (fs[round] && picks.length < 12) picks.push(fs[round]);
  }

const TILE = 210;
const tiles = [];
const stats = [];
for (const f of picks) {
  const src = await sharp(f).png().toBuffer();
  const { mask } = await nearInkPaperMask(src);
  const d92 = await paperDirt(await encodeQ(src, 92), mask);
  const d90 = await paperDirt(await encodeQ(src, 90), mask);
  const name = f.replace('web/static/coloring/', '').replace(`.${suffix}.webp`, '');
  stats.push({ name, q92: d92.dirtyPct, q90: d90.dirtyPct });
  const img = await sharp(src).resize(TILE, TILE, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  tiles.push(await stack([
    img,
    svgLabel(TILE, 22, [name], { size: 12, weight: 600, fg: '#374151' }),
    svgLabel(TILE, 20, [`q92 ${d92.dirtyPct.toFixed(1)}% -> q90 ${d90.dirtyPct.toFixed(1)}%`], { size: 12, weight: 500, fg: d90.dirtyPct > d92.dirtyPct * 1.5 ? '#991b1b' : '#6b7280' }),
  ]));
  console.log(`${name}: q92 ${d92.dirtyPct.toFixed(2)}%  q90 ${d90.dirtyPct.toFixed(2)}%`);
}
const rows = [];
for (let i = 0; i < tiles.length; i += 6) rows.push(await stack(tiles.slice(i, i + 6), { gap: 10, dir: 'h' }));
const body = await stack(rows, { gap: 14 });
const bw = (await sharp(body).metadata()).width;
const title = kind === 'chalk'
  ? 'gen-chalk-outlines q92 — 12 of the 96 chalk pages it encodes'
  : 'gen-fresh-outlines q90 — 12 of the 104 pen outlines it encodes';
await writeFile(`.viz/out/${outName}`, await stack([
  svgLabel(bw, 52, [title, { t: '% = share of paper-next-to-ink pixels the encoder dirties', size: 14, weight: 400, fg: '#6b7280' }], { size: 20, bg: '#f3f4f6' }),
  body,
], { gap: 10, bg: '#e5e7eb' }));
const avg = (k) => (stats.reduce((a, s) => a + s[k], 0) / stats.length).toFixed(2);
console.log(`\nMEAN across 12: q92 ${avg('q92')}%  q90 ${avg('q90')}%`);
