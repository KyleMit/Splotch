// TEMPORARY experiment script (idea #3) — before/after crop pairs:
// before = the night raw's region (what the fill wanted to paint),
// after = the shipped night composite (punched fill + screened chalk white).
// Usage: node tmp-idea3-pairs.mjs <disagreement.json> <outDir> <page[:regionIdx]>...
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const SIZE = 360;
const MARGIN512 = 12;

const [jsonPath, outDir, ...specs] = process.argv.slice(2);
const data = JSON.parse(await readFile(jsonPath, 'utf8'));
await mkdir(outDir, { recursive: true });

function cropRegion(meta, bbox512) {
  const [x0, y0, x1, y1] = bbox512;
  const sx = meta.width / 512;
  const sy = meta.height / 512;
  const left = Math.max(0, Math.round((x0 - MARGIN512) * sx));
  const top = Math.max(0, Math.round((y0 - MARGIN512) * sy));
  const right = Math.min(meta.width, Math.round((x1 + MARGIN512) * sx));
  const bottom = Math.min(meta.height, Math.round((y1 + MARGIN512) * sy));
  return { left, top, width: right - left, height: bottom - top };
}

for (const spec of specs) {
  const [page, idxStr] = spec.split(':');
  const idx = idxStr ? Number(idxStr) : 0;
  const entry = data.find((p) => p.page === page);
  const region = entry?.regions[idx];
  if (!region) {
    console.warn(`(skip) ${spec}`);
    continue;
  }
  const chalk = await readFile(join(COLORING_DIR, `${page}.chalk.webp`));
  const raw = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const composite = await compositeNight(raw, chalk);
  const base = `${page.replace('/', '-')}${idx ? `-r${idx}` : ''}`;
  for (const [suffix, buf] of [
    ['before', raw],
    ['after', composite],
  ]) {
    const meta = await sharp(buf).metadata();
    await sharp(buf)
      .extract(cropRegion(meta, region.bbox))
      .resize(SIZE, SIZE, { fit: 'inside' })
      .webp({ quality: 88 })
      .toFile(join(outDir, `${base}-${suffix}.webp`));
  }
  console.log(`wrote ${base}-{before,after}.webp`);
}
