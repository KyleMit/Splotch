// TEMP (idea #15): where do the two punch variants differ at display scale?
// Writes the shipped display composite with diff>15 pixels painted magenta.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';

const REGIONMEAN = process.env.IDEA15_REGIONMEAN;
const OUT_DIR = process.env.IDEA15_OUT;
if (!REGIONMEAN || !OUT_DIR) throw new Error('set IDEA15_REGIONMEAN/OUT');

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
  for (let p = 0; p < dw * dh; p++) {
    const d = Math.max(
      Math.abs(ca[p * 3] - cb[p * 3]),
      Math.abs(ca[p * 3 + 1] - cb[p * 3 + 1]),
      Math.abs(ca[p * 3 + 2] - cb[p * 3 + 2])
    );
    if (d > 15) {
      ca[p * 3] = 255;
      ca[p * 3 + 1] = 0;
      ca[p * 3 + 2] = 255;
    }
  }
  const long = Math.max(dw, dh);
  const scale = long > 560 ? 560 / long : 1;
  await sharp(ca, { raw: { width: dw, height: dh, channels: 3 } })
    .resize(Math.round(dw * scale), Math.round(dh * scale), { kernel: 'nearest' })
    .png()
    .toFile(join(OUT_DIR, `${slug}-diffmap.png`));
  console.log(`${spec}: diffmap written`);
}
