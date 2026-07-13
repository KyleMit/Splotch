// TEMP (idea #15): quantify shipped (nearest-bleed) vs region-mean punch at
// DISPLAY scale, composited the way the app renders. Prints per-page stats.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';

const REGIONMEAN = process.env.IDEA15_REGIONMEAN;
if (!REGIONMEAN) throw new Error('set IDEA15_REGIONMEAN');

async function loadRgb(path, width, height) {
  let img = sharp(await readFile(path)).removeAlpha();
  if (width) img = img.resize(width, height, { fit: 'fill' });
  return img.raw().toBuffer({ resolveWithObject: true });
}

function compositeApp(theme, fill, line, width, height) {
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

for (const spec of process.argv.slice(2)) {
  const [cat, rest] = [spec.split('/')[0], spec.split('/')[1]];
  const m = rest.match(/^(.+)\.(light|night)$/);
  const page = m[1];
  const theme = m[2];
  const slug = spec.replace(/[/.]/g, '-');
  const shippedPath = join(COLORING_DIR, cat, `${page}.${theme}.webp`);
  const rmPath = join(REGIONMEAN, `${slug}.regionmean.webp`);
  const penPath = join(COLORING_DIR, cat, `${page}.outline.webp`);
  const chalkPath = join(COLORING_DIR, cat, `${page}.chalk.webp`);
  const linePath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;

  const meta = await sharp(await readFile(shippedPath)).metadata();
  const dw = meta.width > meta.height ? 844 : 390;
  const dh = Math.round((meta.height * dw) / meta.width);
  const { data: a } = await loadRgb(shippedPath, dw, dh);
  const { data: b } = await loadRgb(rmPath, dw, dh);
  const { data: line } = await loadRgb(linePath, dw, dh);
  const ca = compositeApp(theme, a, line, dw, dh);
  const cb = compositeApp(theme, b, line, dw, dh);

  let sum = 0;
  let max = 0;
  let over8 = 0;
  let over15 = 0;
  const n = dw * dh;
  for (let p = 0; p < n; p++) {
    const d = Math.max(
      Math.abs(ca[p * 3] - cb[p * 3]),
      Math.abs(ca[p * 3 + 1] - cb[p * 3 + 1]),
      Math.abs(ca[p * 3 + 2] - cb[p * 3 + 2])
    );
    sum += d;
    if (d > max) max = d;
    if (d > 8) over8++;
    if (d > 15) over15++;
  }
  console.log(
    `${spec.padEnd(32)} mean ${(sum / n).toFixed(3)}  max ${String(max).padStart(3)}  >8: ${((over8 / n) * 100).toFixed(3)}%  >15: ${((over15 / n) * 100).toFixed(4)}%`
  );
}
