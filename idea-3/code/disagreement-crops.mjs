// TEMPORARY experiment script (idea #3) — evidence crops for the disagreement
// scorer: for each requested page/region, render a 3-up strip: chalk DISPLAY
// crop (negated, as dark mode shows the line art) | the NIGHT RAW crop (what
// the fill wanted to paint there) | the final NIGHT COMPOSITE crop (punched
// fill + screened chalk — what actually ships, whites winning).
// Usage: node tmp-idea3-crops.mjs <disagreement.json> <outDir> <page[:regionIdx]>...
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const TILE = 176;
const PAD = 6;
const LABEL_H = 26;
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

async function tile(buf, region) {
  return sharp(buf)
    .extract(region)
    .resize(TILE, TILE, { fit: 'contain', background: { r: 24, g: 24, b: 30 } })
    .png()
    .toBuffer();
}

for (const spec of specs) {
  const [page, idxStr] = spec.split(':');
  const idx = idxStr ? Number(idxStr) : 0;
  const entry = data.find((p) => p.page === page);
  if (!entry) {
    console.warn(`(skip) ${page} not in scorer output`);
    continue;
  }
  const region = entry.regions[idx];
  if (!region) {
    console.warn(`(skip) ${page} has no region ${idx}`);
    continue;
  }
  const chalk = await readFile(join(COLORING_DIR, `${page}.chalk.webp`));
  const raw = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const composite = await compositeNight(raw, chalk);
  const chalkDisplay = await sharp(chalk).negate({ alpha: false }).toBuffer();
  const cols = [
    { label: 'chalk (dark-mode lines)', buf: chalkDisplay },
    { label: 'night raw (fill intent)', buf: raw },
    { label: 'shipped composite', buf: composite },
  ];
  const tiles = [];
  for (const c of cols) {
    const meta = await sharp(c.buf).metadata();
    tiles.push(await tile(c.buf, cropRegion(meta, region.bbox)));
  }
  const w = cols.length * (TILE + PAD) + PAD;
  const h = LABEL_H + TILE + PAD * 2;
  const labelSvg = Buffer.from(
    `<svg width="${w}" height="${LABEL_H}">${cols
      .map(
        (c, i) =>
          `<text x="${PAD + i * (TILE + PAD) + TILE / 2}" y="17" fill="#ddd" font-size="11" font-family="sans-serif" text-anchor="middle">${c.label}</text>`
      )
      .join('')}</svg>`
  );
  const layers = [{ input: labelSvg, left: 0, top: 0 }];
  tiles.forEach((t, i) =>
    layers.push({ input: t, left: PAD + i * (TILE + PAD), top: LABEL_H + PAD })
  );
  const name = `${page.replace('/', '-')}${idx ? `-r${idx}` : ''}.webp`;
  await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 24, g: 24, b: 30 } },
  })
    .composite(layers)
    .webp({ quality: 88 })
    .toFile(join(outDir, name));
  console.log(
    `wrote ${name}  (score ${region.score}, frac ${region.coloredFrac}, chroma ${region.meanChroma}, rgb ${region.fillColor ? region.fillColor.join(',') : '-'})`
  );
}
