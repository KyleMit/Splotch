import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import { luma, median } from '../tools/asset-gen/lib/image-stats.mjs';
import { prepareNightAnalysis, fillRgbAt, sourceLumaAt } from '../tools/asset-gen/lib/night-analysis.mjs';
import { floodBackground } from '../tools/asset-gen/lib/regions.mjs';
import { dilateMask, erodeMask } from '../tools/asset-gen/lib/morphology.mjs';
import { OUTLINE_INK_CUTOFF, OUTLINE_MASK_SIZE } from '../tools/asset-gen/lib/outline-match.mjs';
import { resolveNightLineArt } from '../tools/asset-gen/lib/asset-paths.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const OUT = 'viz/out';
const NIGHT_W = 384, DRIFT_DILATE = 6, DRIFT_THIN = 3, DRIFT_LUMA_WHITE = 185, DRIFT_CHROMA_MAX = 45;

const PAGES = ['space/ship-wide', 'creatures/dragon-wide', 'nature/ladybug-wide', 'farm/cow-wide'];
const png = (b, w, h, c = 3) => sharp(b, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
const T = 300;
const fit = (b) => sharp(b).resize(T, T, { fit: 'inside' }).png().toBuffer();

async function scaleBar(value, bar) {
  const W = 400, H = 54;
  const b = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = Math.round((x / (W - 1)) * 255);
    const i = (y * W + x) * 3;
    let c = [g, g, g];
    if (y < 14) c = [13, 17, 23];
    const vx = Math.round((value / 255) * (W - 1)), bx = Math.round((bar / 255) * (W - 1));
    if (Math.abs(x - bx) <= 1) c = [255, 90, 90];
    if (Math.abs(x - vx) <= 2) c = y < 14 ? [255, 255, 255] : [255, 255, 255];
    b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2];
  }
  return sharp(b, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

const bgPanels = [], driftPanels = [];
for (const page of PAGES) {
  const fill = await readFile(join(FILLSRC, `${page}.night.raw.webp`));
  const pen = await readFile(join(COLORING, `${page}.outline.webp`));
  const { source } = await resolveNightLineArt(join(COLORING, `${page}.outline.webp`), pen);
  const analysis = await prepareNightAnalysis(fill, source ?? pen);

  // ---- nightness: median luma of the flood-filled open background ----
  const meta = await sharp(fill).metadata();
  const h1 = Math.max(1, Math.round((meta.height * NIGHT_W) / meta.width));
  const s1 = await sourceLumaAt(analysis, NIGHT_W, h1);
  const t1 = await fillRgbAt(analysis, NIGHT_W, h1);
  const w = s1.info.width, hh = s1.info.height, n = w * hh;
  const bg = floodBackground(s1.data, w, hh);
  const lumas = [];
  const paint = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const r = t1.data[i * 3], g = t1.data[i * 3 + 1], b = t1.data[i * 3 + 2];
    if (bg[i]) {
      lumas.push(luma(r, g, b));
      paint[i * 3] = r; paint[i * 3 + 1] = g; paint[i * 3 + 2] = b;
    } else { paint[i * 3] = 255; paint[i * 3 + 1] = 45; paint[i * 3 + 2] = 133; }
  }
  const bgLuma = median(lumas);
  bgPanels.push(
    { png: await fit(await png(t1.data, w, hh)), label: `${page} night fill`, sub: 'fill-src *.night.raw.webp' },
    { png: await fit(await png(paint, w, hh)), label: 'open background kept', sub: `pink = masked out (${(100 - lumas.length / n * 100).toFixed(0)}% of frame)` },
    { png: await scaleBar(bgLuma, 60), label: `median background luma = ${bgLuma.toFixed(1)}`, sub: '0-255 scale · white tick = this page · red = the 60 bar', color: bgLuma <= 60 ? '#7ee787' : '#ff7b72' },
  );

  // ---- drift: invented thin white far from any source line ----
  const h2 = Math.max(1, Math.round((meta.height * OUTLINE_MASK_SIZE) / meta.width));
  const s2 = await sourceLumaAt(analysis, OUTLINE_MASK_SIZE, h2);
  const t2 = await fillRgbAt(analysis, OUTLINE_MASK_SIZE, h2);
  const w2 = s2.info.width, h2p = s2.info.height, n2 = w2 * h2p;
  const outline = new Uint8Array(n2);
  let srcCount = 0;
  for (let i = 0; i < n2; i++) if (s2.data[i] < OUTLINE_INK_CUTOFF) { outline[i] = 1; srcCount++; }
  const allowed = dilateMask(outline, w2, h2p, DRIFT_DILATE);
  const white = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) {
    const r = t2.data[i * 3], g = t2.data[i * 3 + 1], b = t2.data[i * 3 + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma(r, g, b) > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w2, h2p, DRIFT_THIN), w2, h2p, DRIFT_THIN);
  let added = 0;
  const drift = Buffer.alloc(n2 * 3);
  for (let i = 0; i < n2; i++) {
    const invented = white[i] && !blobs[i] && !allowed[i];
    if (invented) added++;
    let c;
    if (invented) c = [255, 60, 60];
    else if (white[i] && !blobs[i]) c = [88, 166, 255];   // thin white, near a real line — allowed
    else if (white[i]) c = [60, 70, 90];                   // thick white blob — a pale fill, ignored
    else c = [16, 20, 28];
    drift[i * 3] = c[0]; drift[i * 3 + 1] = c[1]; drift[i * 3 + 2] = c[2];
  }
  const whitePng = Buffer.alloc(n2 * 3);
  for (let i = 0; i < n2; i++) { const v = white[i] ? 255 : 20; whitePng[i * 3] = v; whitePng[i * 3 + 1] = v; whitePng[i * 3 + 2] = v; }
  driftPanels.push(
    { png: await fit(await png(t2.data, w2, h2p)), label: `${page} night fill`, sub: 'the gate’s input' },
    { png: await fit(await png(whitePng, w2, h2p)), label: 'luma > 185 & chroma < 45', sub: 'every "white outline-ish" pixel' },
    { png: await fit(await png(drift, w2, h2p)), label: `classified — drift ratio ${(added / srcCount).toFixed(4)}`, sub: `blue = near a source line (ok) · grey = thick pale fill (ignored) · red = invented (${added}px)`, color: added / srcCount < 0.004 ? '#7ee787' : '#ff7b72' },
  );
}

await grid({
  title: 'Gate D1 — night-scores.mjs scoreNightness()',
  subtitle: 'The open background is flood-filled from the border through the line art, then the MEDIAN of luma(r,g,b) over exactly those pixels decides whether the page reads as night. That per-pixel call is one of the five this PR moved onto the shared helper.',
  panels: bgPanels, cols: 3, cell: 300, out: `${OUT}/E1-night-bg.png`,
});
await grid({
  title: 'Gate D2 — night-scores.mjs scoreDrift()',
  subtitle: 'luma(r,g,b) > 185 with low chroma marks a pixel "white outline-ish". Thin white far from any source line is an outline the model invented. Same helper, different bar.',
  panels: driftPanels, cols: 3, cell: 340, out: `${OUT}/E2-night-drift.png`,
});
console.log('done');
