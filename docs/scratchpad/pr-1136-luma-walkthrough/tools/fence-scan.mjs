import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { luma } from '../tools/asset-gen/lib/image-stats.mjs';

async function scan(path, thresholds) {
  const buf = await readFile(path);
  const { data: rgb, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: vips } = await sharp(buf).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let sum = 0, max = 0;
  const flips = thresholds.map(() => 0);
  for (let p = 0; p < n; p++) {
    const rec = luma(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
    const d = Math.abs(vips[p] - rec); sum += d; if (d > max) max = d;
    thresholds.forEach((t, k) => { if ((vips[p] < t) !== (rec < t)) flips[k]++; });
  }
  return { n, mean: sum / n, max, flips: flips.map((f) => f / n) };
}

const sets = {
  'raw light fills (composite-eye DARK 90 / WHITE 200)': { pat: 'tools/asset-gen/fill-src/*/*.light.raw.webp', t: [90, 200] },
  'pen line art (OUTLINE_INK_CUTOFF 110)': { pat: 'web/static/coloring/*/*.outline.webp', t: [110] },
  'chalk line art (OUTLINE_LUMA_THRESHOLD 150)': { pat: 'web/static/coloring/*/*.chalk.webp', t: [150] },
};
for (const [name, { pat, t }] of Object.entries(sets)) {
  const files = [];
  for await (const f of glob(pat)) files.push(f);
  files.sort();
  let worst = null, meanSum = 0, maxAll = 0;
  const flipAgg = t.map(() => ({ sum: 0, max: 0, pages: 0 }));
  for (const f of files) {
    const r = await scan(f, t);
    meanSum += r.mean; maxAll = Math.max(maxAll, r.max);
    r.flips.forEach((v, k) => { flipAgg[k].sum += v; flipAgg[k].max = Math.max(flipAgg[k].max, v); if (v > 0) flipAgg[k].pages++; });
    const score = Math.max(...r.flips);
    if (!worst || score > worst.score) worst = { f, score, r };
  }
  console.log(`\n== ${name}  (${files.length} files)`);
  console.log(`   mean |vips-rec601| = ${(meanSum / files.length).toFixed(2)} levels, worst pixel = ${maxAll.toFixed(1)}`);
  t.forEach((th, k) => console.log(`   threshold ${th}: mean flip ${(flipAgg[k].sum / files.length * 100).toFixed(3)}%, worst page ${(flipAgg[k].max * 100).toFixed(3)}%, pages with >0 flips: ${flipAgg[k].pages}/${files.length}`));
  console.log(`   worst file: ${worst.f}  flips=${worst.r.flips.map((v) => (v * 100).toFixed(3) + '%').join(' / ')}`);
}
