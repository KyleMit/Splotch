// Audit every SHIPPED night fill for a residual dark halo after the punch — the
// dirty mid-dark rim that survives around the chalk strokes when the raw fill
// re-inked its outlines dark (vehicles/train-wide's class) or painted a
// drop-shadow hugging them (objects/teddy-wide). The halo generation gate owns
// this class because page-median lineWhite misses localized re-inking
// (farm/duck-tall measured 173,
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
// The output reports two independent policies: normalized haloScore shows the
// generator's automatic bar, while rawScore requests human crop review because
// deliberate mid-dark art hugging lines can raise it. Existing reviewed catalog
// exceptions remain audit rows rather than making this command a shipping gate.
// Diff --out JSON runs before/after any change to lib/punch-fill.mjs or a
// chalk/raw regen — unchanged pages reproduce bit-identical scores.
// Progress and timing use stderr so stdout stays a pipeable ranked table; --out
// writes the full JSON results.
//
//   npm run check:coloring-night-halo                   whole catalog
//   npm run check:coloring-night-halo -- vehicles       one category
//   npm run check:coloring-night-halo -- vehicles/train-wide
//   npm run check:coloring-night-halo -- --out scores.json   full per-page JSON
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fail } from '../lib/asset-cli.mjs';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt, toPosix } from '../lib/asset-paths.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';
import { prepareNightFillAnalysis, scoreLineColor } from '../lib/night-scores.mjs';
import {
  scoreNightHalo,
  DELTA_RIM,
  HALO_DARK,
  HALO_PROTECT_BLACK,
  NIGHT_HALO_RAW_REVIEW_THRESHOLD,
  NIGHT_HALO_SCORE_MAX,
} from '../lib/night-halo.mjs';

async function auditPage(page) {
  const rawBuf = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  // the line art the shipped fill was punched against (as lib/punch-fill.mjs)
  const { source: lineArtBuf } = await resolveNightLineArt(penPath);
  const shippedBuf = await readFile(join(COLORING_DIR, `${page}.night.webp`));

  const analysis = await prepareNightFillAnalysis(rawBuf, lineArtBuf);
  const { lineWhite: lineW } = await scoreLineColor(analysis);
  const core = await scoreNightHalo(analysis, shippedBuf);

  return {
    page,
    w: core.w,
    h: core.h,
    lineW,
    haloScore: core.haloScore,
    rawScore: core.rawScore,
    automaticPass: core.haloScore <= NIGHT_HALO_SCORE_MAX,
    cropReview: core.rawScore > NIGHT_HALO_RAW_REVIEW_THRESHOLD,
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

const pages = (
  await resolveOutlineTargets(positionals, {
    includeCovers: false,
    explicitFiles: false,
    sort: 'all',
    defaultAll: true,
    onMissing: (target) => fail(`no night page or category "${target}" under ${COLORING_DIR}`),
  })
).map((page) => toPosix(relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '')));
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
  `\nRanked by haloScore (band-1..2 % px with rimDelta>${DELTA_RIM} AND luma in [${HALO_PROTECT_BLACK},${HALO_DARK})). Generator candidates auto-pass at <=${NIGHT_HALO_SCORE_MAX}; rawScore >${NIGHT_HALO_RAW_REVIEW_THRESHOLD} separately requests crop review:`
);
for (const [i, r] of results.entries())
  console.log(
    `${String(i + 1).padStart(3)}. ${r.page.padEnd(28)} haloScore=${String(r.haloScore).padEnd(7)} haloPx=${String(r.haloPx12).padEnd(6)} rawScore=${String(r.rawScore).padEnd(7)} auto=${r.automaticPass ? 'pass  ' : 'reject'} crop=${r.cropReview ? 'review' : '-     '} lineW=${r.lineW}`
  );
if (values.out) await writeFile(values.out, JSON.stringify(results, null, 1));
console.error(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
