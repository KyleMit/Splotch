// TEMPORARY experiment script (idea #3) — chalk-vs-night-fill disagreement
// scorer. For every page with a chalk AND a committed night raw: find the
// connected regions the chalk whitened (chalk ink beyond the dilated pen
// strokes, not on the open background — same definitions as the chalk gates),
// then sample the SAME pixels in the night raw and measure how saturated the
// fill painted them. A high colored fraction means the fill "wanted" color
// there but the punch + screened chalk white it out in the shipped composite.
// Offline, no key/network. Usage: node tmp-idea3-disagreement.mjs <out.json>
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { dilateMask, erodeMask } from './lib/morphology.mjs';

const INK_W = 512;
const INK_DARK = 110; // gen-coloring-chalk.mjs ink threshold
const PEN_SLACK = 2; // dilation of pen strokes the chalk may legitimately cover
const MIN_AREA = 25; // px at 512 — ignore antialias crumbs
const EDGE_ERODE = 2; // shrink each whitened region before sampling the raw, so
// small raw-vs-chalk misregistration / anti-aliased edges don't fake color
const MIN_SAMPLED = 12; // need at least this many eroded px to score a region
const CHROMA_MIN = 40; // max(R,G,B)-min(R,G,B) at/above this = "the fill painted color"

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
    const pixels = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w,
        y = (i / w) | 0;
      area++;
      pixels.push(i);
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
    if (area >= minArea) out.push({ area, bbox: [minX, minY, maxX, maxY], pixels });
  }
  return out.sort((a, b) => b.area - a.area);
}

async function rawRgb512(buf) {
  const { data } = await sharp(buf)
    .removeAlpha()
    .resize(INK_W, INK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function scoreRegion(region, whitenedEroded, rgb) {
  let sampled = 0,
    colored = 0,
    chromaSum = 0,
    r = 0,
    g = 0,
    b = 0;
  for (const i of region.pixels) {
    if (!whitenedEroded[i]) continue;
    sampled++;
    const R = rgb[i * 3],
      G = rgb[i * 3 + 1],
      B = rgb[i * 3 + 2];
    const chroma = Math.max(R, G, B) - Math.min(R, G, B);
    chromaSum += chroma;
    if (chroma >= CHROMA_MIN) {
      colored++;
      r += R;
      g += G;
      b += B;
    }
  }
  if (sampled < MIN_SAMPLED) return null;
  const coloredFrac = colored / sampled;
  return {
    area: region.area,
    bbox: region.bbox,
    sampled,
    coloredFrac: +coloredFrac.toFixed(3),
    meanChroma: +(chromaSum / sampled).toFixed(1),
    coloredPx: colored,
    fillColor: colored
      ? [Math.round(r / colored), Math.round(g / colored), Math.round(b / colored)]
      : null,
    score: Math.round(region.area * coloredFrac),
  };
}

const results = [];
const pages = [];
for await (const entry of glob('**/*-{tall,wide}.chalk.webp', { cwd: COLORING_DIR }))
  pages.push(join(COLORING_DIR, entry));
pages.sort();

for (const chalkPath of pages) {
  const rel = relative(COLORING_DIR, chalkPath)
    .replace(/\.chalk\.webp$/, '')
    .replace(/\\/g, '/');
  const penPath = join(COLORING_DIR, `${rel}.outline.webp`);
  const rawPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  if (!existsSync(penPath) || !existsSync(rawPath)) continue;
  const pen = await inkMask(await readFile(penPath));
  const chalk = await inkMask(await readFile(chalkPath));
  const allowed = dilateMask(pen, INK_W, INK_W, PEN_SLACK);
  const bg = openBackground(pen);
  const whitened = new Uint8Array(INK_W * INK_W);
  for (let i = 0; i < whitened.length; i++) whitened[i] = chalk[i] && !allowed[i] && !bg[i] ? 1 : 0;
  const regions = components(whitened, INK_W, INK_W, MIN_AREA);
  if (!regions.length) continue;
  const eroded = erodeMask(whitened, INK_W, INK_W, EDGE_ERODE);
  const rgb = await rawRgb512(await readFile(rawPath));
  const scored = regions
    .map((reg) => scoreRegion(reg, eroded, rgb))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) continue;
  const pageScore = scored.reduce((s, r) => s + r.score, 0);
  results.push({ page: rel, pageScore, regions: scored });
  const top = scored[0];
  console.log(
    `${rel.padEnd(32)} score ${String(pageScore).padStart(5)}  topRegion area ${String(top.area).padStart(5)} coloredFrac ${top.coloredFrac.toFixed(2)} rgb ${top.fillColor ? top.fillColor.join(',') : '-'}`
  );
}

results.sort((a, b) => b.pageScore - a.pageScore);
const outPath = process.argv[2] ?? 'idea3-disagreement.json';
await writeFile(outPath, JSON.stringify(results, null, 2));
console.log(`\nRANKED (fill wanted color where the chalk whites it out):`);
for (const r of results.slice(0, 20)) {
  const top = r.regions[0];
  console.log(
    `  ${String(r.pageScore).padStart(5)}  ${r.page.padEnd(32)} worst region: ${top.area}px @ [${top.bbox.join(',')}] frac ${top.coloredFrac} rgb(${top.fillColor ? top.fillColor.join(',') : '-'})`
  );
}
console.log(`wrote ${outPath}`);
