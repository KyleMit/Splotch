// IDEAS.md #7 — zoomed display-scale crops of halo hotspots from a scores JSON.
// To run: copy into tools/asset-gen/, then from repo root:
//   node tools/asset-gen/halo-crops.mjs <scores.json> <outDir> <topN> [suffix]
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { compositeNight } from './lib/night-composite.mjs';
import { COLORING_DIR } from './lib/paths.mjs';

const [scoresPath, outDir, topNArg, suffix = ''] = process.argv.slice(2);
const topN = Number(topNArg ?? 10);
const scores = JSON.parse(readFileSync(scoresPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

export async function hotspotCrop(page, hotspot, w, h, outPath, fillPath) {
  const fill = fillPath ?? join(COLORING_DIR, `${page}.night.webp`);
  const chalk = join(COLORING_DIR, `${page}.chalk.webp`);
  const png = await compositeNight(fill, chalk);
  const box = 140; // 64px tile centered in a 140px view
  const left = Math.max(0, Math.min(w - box, hotspot.left + 32 - box / 2));
  const top = Math.max(0, Math.min(h - box, hotspot.top + 32 - box / 2));
  await sharp(png)
    .extract({ left, top, width: box, height: box })
    .resize(box * 4, box * 4, { kernel: 'nearest' })
    .webp({ quality: 90, effort: 5 })
    .toFile(outPath);
}

for (const r of scores.slice(0, topN)) {
  if (!r.hotspots.length) continue;
  const hs = r.hotspots[0];
  const name = r.page.replace('/', '-');
  const out = join(outDir, `${name}${suffix}.webp`);
  await hotspotCrop(r.page, hs, r.w, r.h, out);
  console.log(
    `${r.page} haloScore=${r.haloScore} hotspot(${hs.left},${hs.top}) rimPx=${hs.rimPx} -> ${out}`
  );
}
