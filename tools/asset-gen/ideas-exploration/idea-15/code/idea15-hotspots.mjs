// TEMP (idea #15): find junction-heavy hotspots (masked pixels where >=3 distinct
// fill colors meet) on given pages, and emit zoomed crops of the SHIPPED fill and
// a simulated app composite at each hotspot. Read-only against the repo; writes
// only to OUT_DIR (outside the repo).
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const OUT_DIR = process.env.IDEA15_OUT;
if (!OUT_DIR) throw new Error('set IDEA15_OUT');
const OUTLINE_LUMA_THRESHOLD = 150;
const CROP = 180;
const ZOOM = 3;

const pages = process.argv.slice(2); // e.g. vehicles/fire-tall.night

async function loadPage(spec) {
  const [cat, rest] = [spec.split('/')[0], spec.split('/')[1]];
  const m = rest.match(/^(.+)\.(light|night)$/);
  const page = m[1];
  const theme = m[2];
  const rawPath = join(FILL_SRC_DIR, cat, `${page}.${theme}.raw.webp`);
  const shippedPath = join(COLORING_DIR, cat, `${page}.${theme}.webp`);
  const penPath = join(COLORING_DIR, cat, `${page}.outline.webp`);
  const chalkPath = join(COLORING_DIR, cat, `${page}.chalk.webp`);
  const linePath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;
  const {
    data: raw,
    info: { width, height },
  } = await sharp(await readFile(rawPath))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: shipped } = await sharp(await readFile(shippedPath))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: line } = await sharp(await readFile(linePath))
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  return { spec, theme, raw, shipped, line, mask, width, height };
}

// Junction score for a masked pixel: count of mutually-distinct colors among
// non-masked raw-fill pixels on a radius-R ring around it.
function distinctColorsAt(pg, p, R = 8, thresh = 70) {
  const { raw, mask, width, height } = pg;
  const x = p % width;
  const y = (p / width) | 0;
  const colors = [];
  for (let dy = -R; dy <= R; dy += 2) {
    for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R || dx * dx + dy * dy < (R - 3) * (R - 3)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (mask[q]) continue;
      const c = [raw[q * 3], raw[q * 3 + 1], raw[q * 3 + 2]];
      let matched = false;
      for (const k of colors) {
        const d = Math.abs(k[0] - c[0]) + Math.abs(k[1] - c[1]) + Math.abs(k[2] - c[2]);
        if (d < thresh) {
          matched = true;
          break;
        }
      }
      if (!matched) colors.push(c);
    }
  }
  return colors.length;
}

function findHotspots(pg, topN = 3) {
  const { mask, width, height } = pg;
  const tile = 96;
  const tw = Math.ceil(width / tile);
  const th = Math.ceil(height / tile);
  const score = new Float64Array(tw * th);
  for (let y = 4; y < height - 4; y += 3) {
    for (let x = 4; x < width - 4; x += 3) {
      const p = y * width + x;
      if (!mask[p]) continue;
      const k = distinctColorsAt(pg, p);
      if (k >= 3) score[((y / tile) | 0) * tw + ((x / tile) | 0)] += k - 2;
    }
  }
  const tiles = [];
  for (let t = 0; t < tw * th; t++) if (score[t] > 0) tiles.push({ t, s: score[t] });
  tiles.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const { t, s } of tiles) {
    const cx = ((t % tw) + 0.5) * tile;
    const cy = (((t / tw) | 0) + 0.5) * tile;
    if (picked.some((h) => Math.abs(h.cx - cx) < tile * 2 && Math.abs(h.cy - cy) < tile * 2))
      continue;
    picked.push({ cx: Math.round(cx), cy: Math.round(cy), score: s });
    if (picked.length >= topN) break;
  }
  return picked;
}

// Simulated app composite: light = pen multiplied over fill; night = negated
// chalk screened over fill (fill is opaque, paper never shows).
function compositeApp(pg, fill) {
  const { line, theme, width, height } = pg;
  const out = Buffer.alloc(width * height * 3);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const inkLuma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    for (let c = 0; c < 3; c++) {
      if (theme === 'light') out[i + c] = Math.round((fill[i + c] * line[i + c]) / 255);
      else out[i + c] = Math.round(255 - ((255 - fill[i + c]) * inkLuma) / 255);
    }
  }
  return out;
}

async function saveCrop(buf, pg, cx, cy, name) {
  const { width, height } = pg;
  const x0 = Math.max(0, Math.min(width - CROP, cx - CROP / 2));
  const y0 = Math.max(0, Math.min(height - CROP, cy - CROP / 2));
  const crop = Buffer.alloc(CROP * CROP * 3);
  for (let y = 0; y < CROP; y++)
    buf.copy(crop, y * CROP * 3, ((y0 + y) * width + x0) * 3, ((y0 + y) * width + x0 + CROP) * 3);
  await sharp(crop, { raw: { width: CROP, height: CROP, channels: 3 } })
    .resize(CROP * ZOOM, CROP * ZOOM, { kernel: 'nearest' })
    .png()
    .toFile(join(OUT_DIR, name));
}

await mkdir(OUT_DIR, { recursive: true });
const manifest = [];
for (const spec of pages) {
  const pg = await loadPage(spec);
  const hotspots = findHotspots(pg);
  const slug = spec.replace(/[/.]/g, '-');
  const comp = compositeApp(pg, pg.shipped);
  for (let h = 0; h < hotspots.length; h++) {
    const { cx, cy, score } = hotspots[h];
    await saveCrop(Buffer.from(pg.raw), pg, cx, cy, `${slug}-h${h}-raw.png`);
    await saveCrop(Buffer.from(pg.shipped), pg, cx, cy, `${slug}-h${h}-shipped.png`);
    await saveCrop(comp, pg, cx, cy, `${slug}-h${h}-composite.png`);
    manifest.push({ spec, h, cx, cy, score: Math.round(score) });
  }
  console.log(
    `${spec}: ${hotspots.map((h) => `(${h.cx},${h.cy}) s=${Math.round(h.score)}`).join('  ')}`
  );
}
await writeFile(join(OUT_DIR, 'hotspots.json'), JSON.stringify(manifest, null, 2));
