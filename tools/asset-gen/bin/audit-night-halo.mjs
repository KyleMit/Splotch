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
import { COLORING_DIR, FILL_SRC_DIR, fail } from '../lib/paths.mjs';
import { scoreLineColor } from '../lib/night-scores.mjs';
import { scoreNightHalo, DELTA_RIM, HALO_DARK, HALO_PROTECT_BLACK } from '../lib/night-halo.mjs';

async function auditPage(page) {
  const rawBuf = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  // the line art the shipped fill was punched against (as lib/punch-fill.mjs)
  const lineArtBuf = await readFile(existsSync(chalkPath) ? chalkPath : penPath);
  const shippedBuf = await readFile(join(COLORING_DIR, `${page}.night.webp`));

  const { lineWhite: lineW } = await scoreLineColor(rawBuf, lineArtBuf);
  const core = await scoreNightHalo(rawBuf, lineArtBuf, shippedBuf);

  return {
    page,
    w: core.w,
    h: core.h,
    lineW,
    haloScore: core.haloScore,
    rawScore: core.rawScore,
    haloPx12: core.haloPx12,
    rimPx12: core.rimPx12,
    bandStats: core.bandStats,
    hotspots: core.hotspots,
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
