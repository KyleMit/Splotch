// TEMPORARY experiment script (idea #2) — whitened-region inventory across the
// catalog: for every page with a chalk, find the connected regions the chalk
// whitened (chalk ink beyond the dilated pen strokes, not on the open
// background) and report each region's bbox/area so motifs treated as SOLID
// WHITE can be grouped and compared across sibling pages.
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';
import { dilateMask } from './lib/morphology.mjs';

const INK_W = 512;
const INK_DARK = 110;
const PEN_SLACK = 2;
const MIN_AREA = 25; // px at 512 — ignore antialias crumbs

async function inkMask(buf) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(INK_W, INK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(INK_W * INK_W);
  for (let i = 0; i < data.length; i++) mask[i] = data[i] < INK_DARK ? 1 : 0;
  return mask;
}

function openBackground(penMask) {
  const w = INK_W,
    h = INK_W;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && !penMask[i]) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    push((i % w) + 1, (i / w) | 0);
    push((i % w) - 1, (i / w) | 0);
    push(i % w, ((i / w) | 0) + 1);
    push(i % w, ((i / w) | 0) - 1);
  }
  return bg;
}

function components(mask, w, h, minArea) {
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0,
      minX = w,
      maxX = 0,
      minY = h,
      maxY = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w,
        y = (i / w) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
    }
    if (area >= minArea) out.push({ area, bbox: [minX, minY, maxX, maxY] });
  }
  return out.sort((a, b) => b.area - a.area);
}

const inventory = [];
const pages = [];
for await (const entry of glob('**/*-{tall,wide}.chalk.webp', { cwd: COLORING_DIR }))
  pages.push(join(COLORING_DIR, entry));
pages.sort();

for (const chalkPath of pages) {
  const rel = relative(COLORING_DIR, chalkPath)
    .replace(/\.chalk\.webp$/, '')
    .replace(/\\/g, '/');
  const penPath = join(COLORING_DIR, `${rel}.outline.webp`);
  if (!existsSync(penPath)) continue;
  const pen = await inkMask(await readFile(penPath));
  const chalk = await inkMask(await readFile(chalkPath));
  const allowed = dilateMask(pen, INK_W, INK_W, PEN_SLACK);
  const bg = openBackground(pen);
  const whitened = new Uint8Array(INK_W * INK_W);
  for (let i = 0; i < whitened.length; i++) whitened[i] = chalk[i] && !allowed[i] && !bg[i] ? 1 : 0;
  const regions = components(whitened, INK_W, INK_W, MIN_AREA);
  const total = regions.reduce((s, r) => s + r.area, 0);
  inventory.push({ page: rel, whitenedPx512: total, regions });
  console.log(`${rel.padEnd(32)} regions ${String(regions.length).padStart(2)}  whitened ${total}`);
}

const outPath = process.argv[2] ?? 'whitened-inventory.json';
await writeFile(outPath, JSON.stringify(inventory, null, 2));
console.log(`\nwrote ${outPath}`);
