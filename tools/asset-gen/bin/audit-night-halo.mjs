// Audit every SHIPPED night fill for a residual dark halo after the punch — the
// dirty mid-dark rim that survives around the chalk strokes when the raw fill
// re-inked its outlines dark (vehicles/train-wide's class) or painted a
// drop-shadow hugging them (objects/teddy-wide). No generation gate sees this:
// page-median lineWhite misses localized re-inking (farm/duck-tall measured 173,
// comfortably "white", with a re-inked mouth). Validated as IDEAS #7
// (ideas-exploration/idea-7/report.md, with the full ranked baseline and crop
// verdicts). Deterministic, no API key/network (~0.5 s/page, ~50 s catalog).
//
// How it works, per page:
//   1. rebuild the punch mask from the line art exactly like lib/punch-fill.mjs,
//   2. build a REFERENCE punch: the mask dilated by REF_DILATE, then the standard
//      neighbor bleed on the raw — the fill color from beyond any plausible rim
//      inpainted all the way in,
//   3. for pixels in 1..2-px rings around the ink, rimΔ = luma(reference) −
//      luma(shipped); haloScore = % of ring pixels with rimΔ > 40 AND shipped
//      luma in the mid-dark penumbra window [55, 145) — legit near-black art
//      (an owl's eye ring) sits below the window and doesn't count.
// The output is a RANKING for human crop review, not a verdict: deliberate
// mid-dark art hugging lines (tire rings, strap shading) scores like halo, so
// the top of the table needs an eyeball. Diff --out JSON runs before/after any
// change to lib/punch-fill.mjs or a chalk/raw regen — unchanged pages reproduce
// bit-identical scores.
//
//   npm run gen:coloring-fills:audit:halo                   whole catalog
//   npm run gen:coloring-fills:audit:halo -- vehicles       one category
//   npm run gen:coloring-fills:audit:halo -- vehicles/train-wide
//   npm run gen:coloring-fills:audit:halo -- --out scores.json   full per-page JSON
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { dilateMask } from '../lib/morphology.mjs';
import { COLORING_DIR, FILL_SRC_DIR, fail } from '../lib/paths.mjs';
import { bleedUnderMask, OUTLINE_LUMA_THRESHOLD } from '../lib/punch-fill.mjs';
import { scoreLineColor } from '../lib/night-scores.mjs';

const DELTA_RIM = 40; // rimΔ above this = much darker than the true local fill
const REF_DILATE = 4; // reference punch clears any plausible rim (bands 1..3 + slack)
const MAX_BAND = 3; // hotspots count halo px out to this ring; the score uses 1..2
const HALO_DARK = 145; // the mid-dark penumbra window: a visible halo pixel is
const HALO_PROTECT_BLACK = 55; // luma in [55, 145) — legit near-black ink sits below

async function loadRgb(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

const lumaOf = (rgb, p) => 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];

// The shipped punch's mask, rebuilt with lib/punch-fill.mjs's exact math.
async function punchMask(lineArtBuf, width, height) {
  const { data: line } = await sharp(lineArtBuf)
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  return mask;
}

function ringBands(mask, w, h, maxD) {
  const bands = [];
  let prev = mask;
  for (let d = 1; d <= maxD; d++) {
    const grown = dilateMask(mask, w, h, d);
    const band = [];
    for (let p = 0; p < w * h; p++) if (grown[p] && !prev[p]) band.push(p);
    bands.push(band);
    prev = grown;
  }
  return bands;
}

async function auditPage(page) {
  const rawBuf = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  // the line art the shipped fill was punched against (as lib/punch-fill.mjs)
  const lineArtBuf = await readFile(existsSync(chalkPath) ? chalkPath : penPath);
  const shippedBuf = await readFile(join(COLORING_DIR, `${page}.night.webp`));

  const { rgb: rawRgb, width: w, height: h } = await loadRgb(rawBuf);
  const mask = await punchMask(lineArtBuf, w, h);
  const { lineWhite: lineW } = await scoreLineColor(rawBuf, lineArtBuf);
  const { rgb: shipped } = await loadRgb(shippedBuf);

  const refMask = dilateMask(mask, w, h, REF_DILATE);
  const refRgb = Buffer.from(rawRgb);
  bleedUnderMask(refRgb, refMask, w, h);

  const bands = ringBands(mask, w, h, MAX_BAND);
  const deltaAt = (p) => lumaOf(refRgb, p) - lumaOf(shipped, p);
  const isHalo = (p) => {
    if (deltaAt(p) <= DELTA_RIM) return false;
    const l = lumaOf(shipped, p);
    return l >= HALO_PROTECT_BLACK && l < HALO_DARK;
  };

  const bandStats = bands.map((band, i) => {
    const deltas = band.map(deltaAt).sort((a, b) => a - b);
    const q = (f) => deltas[Math.floor(f * (deltas.length - 1))] ?? NaN;
    return {
      d: i + 1,
      n: deltas.length,
      med: +q(0.5).toFixed(1),
      p90: +q(0.9).toFixed(1),
      p99: +q(0.99).toFixed(1),
      rimShare: deltas.filter((x) => x > DELTA_RIM).length / (deltas.length || 1),
      haloShare: band.filter(isHalo).length / (band.length || 1),
    };
  });

  // haloScore: % of band-1..2 halo pixels (rimΔ + mid-dark window).
  // rawScore: unwindowed rimΔ share, kept to show why the window matters.
  const n12 = bandStats[0].n + bandStats[1].n;
  const halo12 = bandStats[0].haloShare * bandStats[0].n + bandStats[1].haloShare * bandStats[1].n;
  const rim12 = bandStats[0].rimShare * bandStats[0].n + bandStats[1].rimShare * bandStats[1].n;
  const haloScore = +((100 * halo12) / (n12 || 1)).toFixed(3);
  const rawScore = +((100 * rim12) / (n12 || 1)).toFixed(3);

  // hotspots: 64px tiles ranked by count of band-1..3 halo px — page-level share
  // dilutes a localized failure (train-wide's is ~6 face tiles), so an audit
  // consumer should look at both columns
  const counts = new Map();
  for (const band of bands)
    for (const p of band) {
      if (!isHalo(p)) continue;
      const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  const hotspots = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => ({
      left: (k % 1000) * 64,
      top: Math.floor(k / 1000) * 64,
      haloPx: n,
    }));

  return {
    page,
    w,
    h,
    lineW,
    haloScore,
    rawScore,
    haloPx12: Math.round(halo12),
    rimPx12: Math.round(rim12),
    bandStats,
    hotspots,
  };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});

// Resolve args to night pages. An arg is a single page ("vehicles/train-wide")
// or a category dir ("vehicles").
async function pagesUnder(sub = '') {
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  const out = [];
  for await (const entry of glob('**/*.night.webp', { cwd }))
    out.push(
      join(sub, entry)
        .replace(/\\/g, '/')
        .replace(/\.night\.webp$/, '')
    );
  return out;
}
async function resolveArg(arg) {
  if (existsSync(join(COLORING_DIR, `${arg}.night.webp`))) return [arg];
  const asDir = join(COLORING_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return pagesUnder(arg);
  fail(`no night page or category "${arg}" under ${relative(process.cwd(), COLORING_DIR)}`);
}

const pages = (
  positionals.length ? (await Promise.all(positionals.map(resolveArg))).flat() : await pagesUnder()
).sort();
if (!pages.length) fail('No shipped night fills found for the given pages.');

const results = [];
const t0 = Date.now();
for (const page of pages) {
  const r = await auditPage(page);
  results.push(r);
  console.error(
    `${String(results.length).padStart(3)}/${pages.length}  ${page}  haloScore=${r.haloScore}  lineW=${r.lineW}`
  );
}
results.sort((a, b) => b.haloScore - a.haloScore);
console.log(
  `\nRanked by haloScore (band-1..2 % px with rimDelta>${DELTA_RIM} AND luma in [${HALO_PROTECT_BLACK},${HALO_DARK})) — a ranking for crop review, not a verdict:`
);
for (const [i, r] of results.entries())
  console.log(
    `${String(i + 1).padStart(3)}. ${r.page.padEnd(28)} haloScore=${String(r.haloScore).padEnd(7)} haloPx=${String(r.haloPx12).padEnd(6)} rawScore=${String(r.rawScore).padEnd(7)} lineW=${r.lineW}`
  );
if (values.out) await writeFile(values.out, JSON.stringify(results, null, 1));
console.error(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
