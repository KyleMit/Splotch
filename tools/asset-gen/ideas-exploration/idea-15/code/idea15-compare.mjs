// TEMP (idea #15): same-spot crops for the region-mean punch variant plus
// display-scale composite simulations for shipped (nearest-bleed) vs region-mean.
// Reads hotspots.json produced by idea15-hotspots.mjs. Writes only to IDEA15_OUT.
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';

const OUT_DIR = process.env.IDEA15_OUT;
const HOTSPOTS = process.env.IDEA15_HOTSPOTS;
const REGIONMEAN = process.env.IDEA15_REGIONMEAN;
if (!OUT_DIR || !HOTSPOTS || !REGIONMEAN) throw new Error('set IDEA15_OUT/HOTSPOTS/REGIONMEAN');
const CROP = 180;
const ZOOM = 3;
const DISPLAY_WIDTH_TALL = 390;
const DISPLAY_WIDTH_WIDE = 844;

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

async function saveCrop(buf, width, height, cx, cy, size, zoom, name) {
  const x0 = Math.max(0, Math.min(width - size, Math.round(cx - size / 2)));
  const y0 = Math.max(0, Math.min(height - size, Math.round(cy - size / 2)));
  const crop = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++)
    buf.copy(crop, y * size * 3, ((y0 + y) * width + x0) * 3, ((y0 + y) * width + x0 + size) * 3);
  await sharp(crop, { raw: { width: size, height: size, channels: 3 } })
    .resize(size * zoom, size * zoom, { kernel: 'nearest' })
    .png()
    .toFile(join(OUT_DIR, name));
}

await mkdir(OUT_DIR, { recursive: true });
const hotspots = JSON.parse(await readFile(HOTSPOTS, 'utf8'));
const bySpec = new Map();
for (const h of hotspots) {
  if (!bySpec.has(h.spec)) bySpec.set(h.spec, []);
  bySpec.get(h.spec).push(h);
}

for (const [spec, spots] of bySpec) {
  const slug = spec.replace(/[/.]/g, '-');
  const rmPath = join(REGIONMEAN, `${slug}.regionmean.webp`);
  if (!existsSync(rmPath)) continue;
  const [cat, rest] = [spec.split('/')[0], spec.split('/')[1]];
  const m = rest.match(/^(.+)\.(light|night)$/);
  const page = m[1];
  const theme = m[2];
  const shippedPath = join(COLORING_DIR, cat, `${page}.${theme}.webp`);
  const penPath = join(COLORING_DIR, cat, `${page}.outline.webp`);
  const chalkPath = join(COLORING_DIR, cat, `${page}.chalk.webp`);
  const linePath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;

  const {
    data: _shipped,
    info: { width, height },
  } = await loadRgb(shippedPath);
  const { data: rm } = await loadRgb(rmPath);
  const { data: line } = await loadRgb(linePath, width, height);
  const compRm = compositeApp(theme, rm, line, width, height);

  const dw = width > height ? DISPLAY_WIDTH_WIDE : DISPLAY_WIDTH_TALL;
  const dh = Math.round((height * dw) / width);
  const { data: dShipped } = await loadRgb(shippedPath, dw, dh);
  const { data: dRm } = await loadRgb(rmPath, dw, dh);
  const { data: dLine } = await loadRgb(linePath, dw, dh);
  const dCompShipped = compositeApp(theme, dShipped, dLine, dw, dh);
  const dCompRm = compositeApp(theme, dRm, dLine, dw, dh);

  for (const { h, cx, cy } of spots) {
    await saveCrop(
      Buffer.from(rm),
      width,
      height,
      cx,
      cy,
      CROP,
      ZOOM,
      `${slug}-h${h}-regionmean.png`
    );
    await saveCrop(
      compRm,
      width,
      height,
      cx,
      cy,
      CROP,
      ZOOM,
      `${slug}-h${h}-regionmean-composite.png`
    );
    const scale = dw / width;
    await saveCrop(
      dCompShipped,
      dw,
      dh,
      cx * scale,
      cy * scale,
      130,
      4,
      `${slug}-h${h}-display-shipped.png`
    );
    await saveCrop(
      dCompRm,
      dw,
      dh,
      cx * scale,
      cy * scale,
      130,
      4,
      `${slug}-h${h}-display-regionmean.png`
    );
  }
  console.log(`${spec}: crops written`);
}
