// TEMPORARY experiment script (idea #2) — motif contact strip: given a registry
// JSON { "<motif>": [{ "page": "cat/page-orient", "bbox512": [x0,y0,x1,y1],
// "label": "…", "chalk": "optional override path" }] }, render one horizontal
// strip per motif with each occurrence's CHALK DISPLAY crop (negated, as dark
// mode shows it) and, when the page has a night raw, the NIGHT COMPOSITE crop
// underneath. Usage: node tmp-motif-strip.mjs <registry.json> <outDir>
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const TILE = 240;
const PAD = 8;
const LABEL_H = 26;
const MARGIN512 = 10;

const [registryPath, outDir] = process.argv.slice(2);
if (!registryPath || !outDir) {
  console.error('usage: node tmp-motif-strip.mjs <registry.json> <outDir>');
  process.exit(1);
}
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
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

async function tile(buf, region) {
  return sharp(buf)
    .extract(region)
    .resize(TILE, TILE, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer();
}

for (const [motif, entries] of Object.entries(registry)) {
  const columns = [];
  for (const e of entries) {
    const chalkPath = e.chalk ? e.chalk : join(COLORING_DIR, `${e.page}.chalk.webp`);
    if (!existsSync(chalkPath)) {
      console.warn(`(skip) no chalk for ${e.page}`);
      continue;
    }
    const chalk = await readFile(chalkPath);
    const meta = await sharp(chalk).metadata();
    const region = cropRegion(meta, e.bbox512);
    const display = await sharp(chalk).negate({ alpha: false }).toBuffer();
    const rows = [await tile(display, region)];
    const nightRaw = e.night ? e.night : join(FILL_SRC_DIR, `${e.page}.night.raw.webp`);
    if (existsSync(nightRaw)) {
      const composite = await compositeNight(await readFile(nightRaw), chalk);
      rows.push(await tile(composite, region));
    }
    columns.push({ label: e.label ?? e.page, rows });
  }
  if (!columns.length) continue;
  const nRows = Math.max(...columns.map((c) => c.rows.length));
  const w = columns.length * (TILE + PAD) + PAD;
  const h = LABEL_H + nRows * (TILE + PAD) + PAD;
  const labelSvg = Buffer.from(
    `<svg width="${w}" height="${LABEL_H}">${columns
      .map(
        (c, i) =>
          `<text x="${PAD + i * (TILE + PAD) + TILE / 2}" y="18" fill="#ddd" font-size="13" font-family="sans-serif" text-anchor="middle">${c.label}</text>`
      )
      .join('')}</svg>`
  );
  const layers = [{ input: labelSvg, left: 0, top: 0 }];
  columns.forEach((c, i) =>
    c.rows.forEach((r, j) =>
      layers.push({
        input: r,
        left: PAD + i * (TILE + PAD),
        top: LABEL_H + PAD + j * (TILE + PAD),
      })
    )
  );
  const out = join(outDir, `motif-${motif}.png`);
  await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 24, g: 24, b: 30 } },
  })
    .composite(layers)
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
}
