import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { globSync } from 'node:fs';

const GROUPS = [
  {
    name: 'chalk outlines (gen-chalk-outlines, q92)',
    glob: 'web/static/coloring/**/*.chalk.webp',
    shipped: true,
  },
  {
    name: 'pen outlines (gen-fresh-outlines, q90)',
    glob: 'web/static/coloring/**/*.outline.webp',
    shipped: true,
  },
  {
    name: 'light raw fills (gen-light-fills, q90)',
    glob: 'tools/asset-gen/fill-src/**/*.light.raw.webp',
    shipped: false,
  },
  {
    name: 'night raw fills (gen-night-fills, q90)',
    glob: 'tools/asset-gen/fill-src/**/*.night.raw.webp',
    shipped: false,
  },
  { name: 'style covers (gen-style-covers, q75)', glob: 'web/static/styles/*.webp', shipped: true },
];
const QS = [75, 90, 92];

for (const g of GROUPS) {
  const files = globSync(g.glob).filter((f) => !f.includes('.overlay.'));
  const totals = Object.fromEntries(QS.map((q) => [q, 0]));
  let onDisk = 0;
  for (const f of files) {
    const src = await sharp(f).png().toBuffer();
    onDisk += (await readFile(f)).length;
    for (const q of QS) totals[q] += (await sharp(src).webp({ quality: q }).toBuffer()).length;
  }
  const mb = (b) => (b / 1024 / 1024).toFixed(2);
  console.log(
    `${g.name}\n  files ${files.length}  on-disk ${mb(onDisk)} MB  |  re-encoded: ${QS.map((q) => `q${q} ${mb(totals[q])} MB`).join('  ')}`
  );
  console.log(
    `  q90 vs q92: ${mb(totals[92] - totals[90])} MB saved (${(((totals[92] - totals[90]) / totals[92]) * 100).toFixed(1)}%)   q75 vs q92: ${mb(totals[92] - totals[75])} MB saved (${(((totals[92] - totals[75]) / totals[92]) * 100).toFixed(1)}%)`
  );
}
