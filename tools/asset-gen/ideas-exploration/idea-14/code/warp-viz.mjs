// TEMP experiment script (idea #14) — visualize a page's local-warp field:
//  1. displacement heatmap + quiver over the dimmed source line art
//  2. worst-tile zoom crop: source lines (red) vs fill lines (cyan)
//  3. simulated night composite crop at the worst tile (reveal-edge shimmer check)
// Run: node tools/asset-gen/warp-viz.mjs <book/page> <light|night> <json> <outdir>
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { compositeNight } from './lib/night-composite.mjs';

const [, , pageArg, theme, jsonPath, outDir] = process.argv;
const results = JSON.parse(readFileSync(jsonPath, 'utf8'));
const rec = results.find((r) => r.page === pageArg && r.theme === theme);
if (!rec) {
  console.error(`no record for ${pageArg} ${theme}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const slug = `${pageArg.replace('/', '-')}-${theme}`;

const LONG = 560;

function heatColor(local) {
  const t = Math.min(1, local / 8);
  return [Math.round(40 + 215 * t), Math.round(200 - 150 * t), 60];
}

function drawLine(rgb, w, h, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      const p = (y * w + x) * 3;
      rgb[p] = c[0];
      rgb[p + 1] = c[1];
      rgb[p + 2] = c[2];
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

async function heatmap() {
  const scale = LONG / Math.max(rec.width, rec.height);
  const w = Math.round(rec.width * scale);
  const h = Math.round(rec.height * scale);
  const { data } = await sharp(rec.source)
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = 180 + (data[i] * 75) / 255;
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = v;
  }
  const tw = w / rec.cols;
  const th = h / rec.rows;
  for (const t of rec.tiles) {
    const c = heatColor(t.local);
    const x0 = Math.round(t.tx * tw);
    const y0 = Math.round(t.ty * th);
    for (let y = y0; y < Math.min(h, y0 + th); y++) {
      for (let x = x0; x < Math.min(w, x0 + tw); x++) {
        const p = (y * w + x) * 3;
        const a = 0.35;
        rgb[p] = rgb[p] * (1 - a) + c[0] * a;
        rgb[p + 1] = rgb[p + 1] * (1 - a) + c[1] * a;
        rgb[p + 2] = rgb[p + 2] * (1 - a) + c[2] * a;
      }
    }
    const cx = Math.round(t.cx * scale);
    const cy = Math.round(t.cy * scale);
    const ex = Math.round(cx + (t.dx - rec.globalDx) * 6 * scale);
    const ey = Math.round(cy + (t.dy - rec.globalDy) * 6 * scale);
    drawLine(rgb, w, h, cx, cy, ex, ey, [10, 10, 200]);
    drawLine(rgb, w, h, cx - 1, cy, cx + 1, cy, [10, 10, 200]);
  }
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .webp({ quality: 88 })
    .toFile(join(outDir, `${slug}-heatmap.webp`));
  console.log(`wrote ${slug}-heatmap.webp`);
}

function tileRegion(t) {
  const twn = rec.width / rec.cols;
  const thn = rec.height / rec.rows;
  const pad = 40;
  const left = Math.max(0, Math.round(t.tx * twn - pad));
  const top = Math.max(0, Math.round(t.ty * thn - pad));
  const width = Math.min(rec.width - left, Math.round(twn + 2 * pad));
  const height = Math.min(rec.height - top, Math.round(thn + 2 * pad));
  return { left, top, width, height };
}

async function tileCrop(t, label) {
  const region = tileRegion(t);
  const srcG = await sharp(rec.source).grayscale().extract(region).raw().toBuffer();
  const fillG = await sharp(rec.fill).grayscale().extract(region).raw().toBuffer();
  const { width: cw, height: ch } = region;
  const srcInk = (i) => srcG[i] < 110;
  const fillDark = theme === 'light';
  const fillInk = (i) => (fillDark ? fillG[i] < 110 : fillG[i] > 150);
  const rgb = Buffer.alloc(cw * ch * 3, 255);
  for (let i = 0; i < cw * ch; i++) {
    const s = srcInk(i);
    const f = fillInk(i);
    const p = i * 3;
    if (s && f) {
      rgb[p] = 40;
      rgb[p + 1] = 40;
      rgb[p + 2] = 40;
    } else if (s) {
      rgb[p] = 225;
      rgb[p + 1] = 40;
      rgb[p + 2] = 40;
    } else if (f) {
      rgb[p] = 0;
      rgb[p + 1] = 170;
      rgb[p + 2] = 200;
    }
  }
  const up = Math.max(1, Math.floor(LONG / Math.max(cw, ch)));
  await sharp(rgb, { raw: { width: cw, height: ch, channels: 3 } })
    .resize(cw * up, ch * up, { kernel: 'nearest' })
    .webp({ quality: 88, lossless: true })
    .toFile(join(outDir, `${slug}-${label}.webp`));
  console.log(
    `wrote ${slug}-${label}.webp (tile ${t.tx},${t.ty} d=(${t.dx},${t.dy}) local ${t.local.toFixed(1)} gain ${t.gain.toFixed(2)})`
  );
}

async function compositeCrop(t, label) {
  if (theme !== 'night') return;
  const chalk = rec.source;
  if (!existsSync(chalk)) return;
  const fillBuf = readFileSync(rec.fill);
  const chalkBuf = readFileSync(chalk);
  const comp = await compositeNight(fillBuf, chalkBuf);
  const region = tileRegion(t);
  const up = Math.max(1, Math.floor(LONG / Math.max(region.width, region.height)));
  await sharp(comp)
    .extract(region)
    .resize(region.width * up, region.height * up, { kernel: 'nearest' })
    .webp({ quality: 90 })
    .toFile(join(outDir, `${slug}-${label}-composite.webp`));
  console.log(`wrote ${slug}-${label}-composite.webp`);
}

const worst = [...rec.tiles].sort((a, b) => b.local - a.local);
const confident = worst.filter((t) => t.gain >= 1.15);
await heatmap();
if (worst[0]) {
  await tileCrop(worst[0], 'worst-tile');
  await compositeCrop(worst[0], 'worst-tile');
}
if (confident[0] && confident[0] !== worst[0]) {
  await tileCrop(confident[0], 'worst-confident-tile');
  await compositeCrop(confident[0], 'worst-confident-tile');
}
