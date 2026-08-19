import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { svgLabel, stack } from './lib.mjs';

const P = 'creatures/owl-wide';
const W = 440;
const steps = [
  { f: `web/static/coloring/${P}.outline.webp`, t: '1 · pen outline', s: 'gen-fresh-outlines q90 / normalize q92', c: '#92400e' },
  { f: `tools/asset-gen/fill-src/${P}.light.raw.webp`, t: '2 · raw light fill', s: 'gen-light-fills q90 — archived, NEVER shipped', c: '#1d4ed8' },
  { f: `web/static/coloring/max-1152px/${P}.light.webp`, t: '3 · punched + shipped', s: 'punch-fill.mjs re-encodes at q85 (not in this PR)', c: '#111827' },
];
const cells = await Promise.all(steps.map(async (s) =>
  stack([
    svgLabel(W, 58, [s.t, { t: s.s, size: 14, weight: 400, fg: '#6b7280' }], { size: 19, fg: s.c }),
    await sharp(s.f).resize(W).png().toBuffer(),
  ])));
const body = await stack(cells, { gap: 12, dir: 'h' });
const bw = (await sharp(body).metadata()).width;
await writeFile('.viz/out/e13-light-chain.png', await stack([
  svgLabel(bw, 58, ['gen-light-fills q90 governs the middle picture, not the one the app downloads',
    { t: 'the outline pixels vanish in step 3 — that is the punch, ADR-0043 reveal fills', size: 14, weight: 400, fg: '#6b7280' }], { size: 21, bg: '#f3f4f6' }),
  body,
], { gap: 10, bg: '#e5e7eb' }));
console.log('ok');
