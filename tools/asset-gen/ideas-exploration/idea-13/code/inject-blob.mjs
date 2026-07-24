// IDEA 13 experiment — synthesize a POSITIVE test case: paste a saturated
// "invented planet" and a small "invented star" onto a clean shipped night
// raw's open background, so the detector can be proven to catch the failure
// mode it targets. Writes the doctored image to the given output path.
//   node tools/asset-gen/idea13-inject-blob.mjs <page.theme> <out.webp>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, fail } from './lib/paths.mjs';
import { existsSync } from 'node:fs';
import { erodeMask } from './lib/morphology.mjs';
import { detectInventedShapes } from './idea13-invented-shape-audit.mjs';

const [pageTheme, outPath] = process.argv.slice(2);
if (!pageTheme || !outPath)
  fail('usage: idea13-inject-blob.mjs <book/page-orient.theme> <out.webp>');
const m = pageTheme.match(/^(.+)\.(light|night)$/);
if (!m) fail('page must end in .light or .night');
const [, page, theme] = m;

const fillPath = join(FILL_SRC_DIR, `${page}.${theme}.raw.webp`);
const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
const penPath = join(COLORING_DIR, `${page}.outline.webp`);
const srcPath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;

const fill = await readFile(fillPath);
const source = await readFile(srcPath);
const meta = await sharp(fill).metadata();
const res = await detectInventedShapes(fill, source);
if (res.skipped) fail('page has no open background to inject into');

// Find deep-interior open-background spots: erode the candidate mask until few
// pixels survive; survivors sit far from every source line and the border.
const { w, h, cand } = res;
let last = cand;
for (let r = 2; r <= 40; r += 2) {
  const next = erodeMask(cand, w, h, r);
  if (!next.some(Boolean)) break;
  last = next;
}
const spots = [];
for (let i = 0; i < w * h && spots.length < 2000; i++) if (last[i]) spots.push(i);
if (spots.length < 2) fail('could not find open background spots');
// take two spots far apart: the first survivor and the survivor farthest from it
const a = spots[0];
let b = spots[0];
let bestD = -1;
for (const i of spots) {
  const dx = (i % w) - (a % w);
  const dy = ((i / w) | 0) - ((a / w) | 0);
  const d = dx * dx + dy * dy;
  if (d > bestD) {
    bestD = d;
    b = i;
  }
}
const scale = meta.width / w;
const p1 = { x: Math.round((a % w) * scale), y: Math.round(((a / w) | 0) * scale) };
const p2 = { x: Math.round((b % w) * scale), y: Math.round(((b / w) | 0) * scale) };

// an orange planet (saturated disc + ring) at p1, a golden 4-point star at p2
const R = Math.round(36 * (meta.width / 1024));
const starR = Math.round(16 * (meta.width / 1024));
const star = (cx, cy, r) =>
  `M ${cx} ${cy - r} Q ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q ${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q ${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q ${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z`;
const svg = Buffer.from(
  `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${p1.x}" cy="${p1.y}" r="${R}" fill="rgb(235,140,52)"/>
    <ellipse cx="${p1.x}" cy="${p1.y}" rx="${R * 1.6}" ry="${R * 0.45}" fill="none" stroke="rgb(240,190,90)" stroke-width="${Math.max(3, R * 0.16)}" transform="rotate(-18 ${p1.x} ${p1.y})"/>
    <path d="${star(p2.x, p2.y, starR)}" fill="rgb(250,210,80)"/>
  </svg>`
);
await sharp(fill)
  .composite([{ input: svg }])
  .webp({ quality: 90 })
  .toFile(outPath);
console.log(
  `injected planet r=${R} at ${p1.x},${p1.y} and star r=${starR} at ${p2.x},${p2.y} -> ${outPath}`
);
