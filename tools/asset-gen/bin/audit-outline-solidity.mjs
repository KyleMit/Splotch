// Audit every shipped line art for SOLID black regions — the areas that break
// dark mode (blanket invert paints them as white blobs; see lib/solid-regions.mjs
// for the mechanism and the measure). Offenders are candidates for
// normalize-outline-strokes.mjs. Deterministic, no API key/network.
//
//   npm run gen:coloring-outlines:audit                 whole catalog
//   npm run gen:coloring-outlines:audit -- nature       one category
//   npm run gen:coloring-outlines:audit -- nature/ant-tall
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { COLORING_DIR, fail } from '../lib/paths.mjs';
import { scoreSolidity, SOLID_BLOB_MAX, SOLID_INTERIOR_MAX } from '../lib/solid-regions.mjs';
import { scoreEyeRings, EYE_RING_DEPTH_MAX } from '../lib/eye-fill.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';

const args = process.argv.slice(2);
const pages = await resolveOutlineTargets(args, {
  includeCovers: true,
  explicitFiles: false,
  sort: 'per-target',
  defaultAll: true,
  onMissing: (target) => fail(`no page or category "${target}" under ${COLORING_DIR}`),
});

const rows = [];
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '');
  const buf = await readFile(page);
  const { darkPx, solidPx, interiorPx, biggestBlob, passes } = await scoreSolidity(buf);
  const rings = await scoreEyeRings(buf);
  rows.push({
    rel,
    darkPx,
    solidPx,
    interiorPx,
    biggestBlob,
    ringDepth: rings.maxDepth,
    passes: passes && rings.passes,
    solidOk: passes,
    ringsOk: rings.passes,
  });
}
rows.sort((a, b) => b.biggestBlob - a.biggestBlob);

console.log(
  'page'.padEnd(36),
  'solid px'.padStart(9),
  'interior px'.padStart(12),
  'biggest blob'.padStart(13),
  'ring depth'.padStart(11),
  '  verdict'
);
for (const r of rows) {
  const problems = [];
  if (!r.solidOk)
    problems.push(`SOLID (blob > ${SOLID_BLOB_MAX} or interior > ${SOLID_INTERIOR_MAX})`);
  if (!r.ringsOk) problems.push(`OVER-RINGED (depth > ${EYE_RING_DEPTH_MAX})`);
  console.log(
    r.rel.padEnd(36),
    String(r.solidPx).padStart(9),
    String(r.interiorPx).padStart(12),
    String(r.biggestBlob).padStart(13),
    String(r.ringDepth).padStart(11),
    ' ',
    problems.length ? problems.join(' + ') : 'ok'
  );
}
const offenders = rows.filter((r) => !r.passes);
console.log(
  `\n${offenders.length}/${rows.length} outline(s) need normalizing (solid regions or over-ringed eyes)` +
    (offenders.length ? ` — npm run gen:coloring-outlines:normalize -- <page>` : '')
);
