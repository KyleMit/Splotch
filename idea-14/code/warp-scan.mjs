// TEMP experiment script (idea #14) — per-tile displacement scorer for local
// warp between a page's source line art and its committed raw fill.
// Run from repo root: node tools/asset-gen/warp-scan.mjs [--theme night|light|both] [--out DIR]
import { readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const EDGE_MIN = 60; // same bar as alignToSource
const TILE_PX = 128; // native-resolution tile size (12x8 grid on a 1536x1024 wide)
const SEARCH = 12; // +/- native px local search radius
const TILE_MIN_EDGES = 300; // skip tiles with too little source line ink
const TILE_MAX_EDGES = 2000; // cap for speed (keep strongest)

async function grayRaw(path) {
  const { data, info } = await sharp(path).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { g: data, w: info.width, h: info.height };
}

function edgeMap(g, w, h) {
  const e = new Float32Array(w * h);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      e[i] = Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]);
    }
  }
  return e;
}

function boxBlur3(e, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += e[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

// Offsets sorted by magnitude so ties resolve to the smallest displacement
// (aperture-problem tiles read as 0 instead of a random large vector).
const OFFSETS = [];
for (let dy = -SEARCH; dy <= SEARCH; dy++)
  for (let dx = -SEARCH; dx <= SEARCH; dx++) OFFSETS.push([dx, dy]);
OFFSETS.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));

export async function warpField(sourcePath, fillPath) {
  const { g: sg, w, h } = await grayRaw(sourcePath);
  const { g: fg, w: fw, h: fh } = await grayRaw(fillPath);
  if (fw !== w || fh !== h) throw new Error(`size mismatch ${sourcePath}`);
  const srcE = edgeMap(sg, w, h);
  const fillE = boxBlur3(edgeMap(fg, w, h), w, h);
  const cols = Math.round(w / TILE_PX);
  const rows = Math.round(h / TILE_PX);
  const tiles = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = Math.round((tx * w) / cols);
      const x1 = Math.round(((tx + 1) * w) / cols);
      const y0 = Math.round((ty * h) / rows);
      const y1 = Math.round(((ty + 1) * h) / rows);
      const pts = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (srcE[i] > EDGE_MIN) pts.push([i, srcE[i]]);
        }
      }
      if (pts.length < TILE_MIN_EDGES) continue;
      pts.sort((a, b) => b[1] - a[1]);
      const use = pts.slice(0, TILE_MAX_EDGES);
      let best = { dx: 0, dy: 0, score: -1 };
      let zero = 0;
      let sum = 0;
      for (const [dx, dy] of OFFSETS) {
        let s = 0;
        for (const [i, wt] of use) {
          const x = (i % w) + dx;
          const y = ((i / w) | 0) + dy;
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          s += wt * fillE[y * w + x];
        }
        sum += s;
        if (dx === 0 && dy === 0) zero = s;
        if (s > best.score) best = { dx, dy, score: s };
      }
      const mean = sum / OFFSETS.length;
      tiles.push({
        tx,
        ty,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        dx: best.dx,
        dy: best.dy,
        mag: Math.hypot(best.dx, best.dy),
        ink: pts.length,
        gain: zero > 0 ? best.score / zero : Infinity,
        peak: mean > 0 ? best.score / mean : 0,
      });
    }
  }
  const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length ? s[(s.length / 2) | 0] : 0;
  };
  const gdx = med(tiles.map((t) => t.dx));
  const gdy = med(tiles.map((t) => t.dy));
  for (const t of tiles) t.local = Math.hypot(t.dx - gdx, t.dy - gdy);
  const locals = tiles.map((t) => t.local).sort((a, b) => a - b);
  const q = (p) =>
    locals.length ? locals[Math.min(locals.length - 1, (locals.length * p) | 0)] : 0;
  return {
    width: w,
    height: h,
    cols,
    rows,
    globalDx: gdx,
    globalDy: gdy,
    tiles,
    scored: tiles.length,
    localMax: q(1),
    localP90: q(0.9),
    localMedian: q(0.5),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const theme = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : 'both';
  const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.';
  mkdirSync(outDir, { recursive: true });
  const themes = theme === 'both' ? ['night', 'light'] : [theme];
  const results = [];
  const books = (await readdir(FILL_SRC_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const book of books) {
    const files = (await readdir(join(FILL_SRC_DIR, book))).filter((f) => f.endsWith('.raw.webp'));
    for (const f of files) {
      const m = f.match(/^(.+)\.(light|night)\.raw\.webp$/);
      if (!m || !themes.includes(m[2])) continue;
      const [, page, th] = m;
      const pen = join(COLORING_DIR, book, `${page}.outline.webp`);
      const chalk = join(COLORING_DIR, book, `${page}.chalk.webp`);
      const source = th === 'night' && existsSync(chalk) ? chalk : pen;
      if (!existsSync(source)) {
        console.warn(`skip ${book}/${page} (${th}): no source`);
        continue;
      }
      const t0 = Date.now();
      const field = await warpField(source, join(FILL_SRC_DIR, book, f));
      results.push({
        page: `${book}/${page}`,
        theme: th,
        source,
        fill: join(FILL_SRC_DIR, book, f),
        ...field,
      });
      console.log(
        `${book}/${page} ${th}: global (${field.globalDx},${field.globalDy}) localMax ${field.localMax.toFixed(1)} p90 ${field.localP90.toFixed(1)} med ${field.localMedian.toFixed(1)} tiles ${field.scored} [${Date.now() - t0}ms]`
      );
    }
  }
  writeFileSync(join(outDir, `warp-${theme}.json`), JSON.stringify(results, null, 1));
  console.log(`\nwrote ${results.length} results to ${join(outDir, `warp-${theme}.json`)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
