// Audit every shipped line art for solid black regions, over-ringed eyes, and
// page frames. Solid ink and excess eye rings violate the thin-stroke contract
// used by punch/invert (lib/solid-regions.mjs, lib/eye-fill.mjs); four-sided
// frames and page-spanning near-white ghost lines are unwanted enclosures
// (lib/outline-frame.mjs). Deterministic, no API key/network.
//
//   npm run check:coloring-outline-quality                 whole catalog
//   npm run check:coloring-outline-quality -- nature       one category
//   npm run check:coloring-outline-quality -- nature/ant-tall
import { relative } from 'node:path';
import { fail } from '../lib/asset-cli.mjs';
import { COLORING_DIR } from '../lib/asset-paths.mjs';
import { scoreSolidity, SOLID_BLOB_MAX, SOLID_INTERIOR_MAX } from '../lib/solid-regions.mjs';
import { scoreEyeRings, EYE_RING_DEPTH_MAX } from '../lib/eye-fill.mjs';
import {
  scoreOutlineFrame,
  FRAME_SIDE_COVERAGE_MIN,
  GHOST_SIDE_COVERAGE_MIN,
} from '../lib/outline-frame.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import { lineArtStem, rasterizeLineArt } from '../lib/line-art.mjs';
import { resolveLineArtTargets } from '../lib/line-art-targets.mjs';

const args = process.argv.slice(2);
const pages = await resolveLineArtTargets(args, {
  includeCovers: true,
  explicitFiles: false,
  sort: 'per-target',
  defaultAll: true,
  onMissing: (target) => fail(`no page or category "${target}" under ${COLORING_DIR}`),
});

const rows = [];
let errors = 0;
for (const page of pages) {
  const rel = lineArtStem(relative(COLORING_DIR, page));
  try {
    const buf = await rasterizeLineArt(page);
    const analysis = await prepareOutlineAnalysis(buf);
    const [solidity, rings, frame] = await Promise.all([
      scoreSolidity(analysis),
      scoreEyeRings(analysis),
      scoreOutlineFrame(analysis),
    ]);
    rows.push({
      rel,
      darkPx: solidity.darkPx,
      solidPx: solidity.solidPx,
      interiorPx: solidity.interiorPx,
      biggestBlob: solidity.biggestBlob,
      ringDepth: rings.maxDepth,
      frameCoverage: frame.sideCoverage,
      ghostCoverage: frame.ghostCoverage,
      passes: solidity.passes && rings.passes && frame.passes,
      solidOk: solidity.passes,
      ringsOk: rings.passes,
      frameOk: frame.passes,
    });
  } catch (error) {
    console.error(`${rel}  ERROR (${error instanceof Error ? error.message : String(error)})`);
    errors++;
  }
}
rows.sort((a, b) => b.biggestBlob - a.biggestBlob);

console.log(
  'page'.padEnd(36),
  'solid px'.padStart(9),
  'interior px'.padStart(12),
  'biggest blob'.padStart(13),
  'ring depth'.padStart(11),
  'frame sides'.padStart(12),
  'ghost side'.padStart(11),
  '  verdict'
);
for (const r of rows) {
  const problems = [];
  if (!r.solidOk)
    problems.push(`SOLID (blob > ${SOLID_BLOB_MAX} or interior > ${SOLID_INTERIOR_MAX})`);
  if (!r.ringsOk) problems.push(`OVER-RINGED (depth > ${EYE_RING_DEPTH_MAX})`);
  if (!r.frameOk)
    problems.push(
      r.frameCoverage >= FRAME_SIDE_COVERAGE_MIN
        ? `PAGE FRAME (side coverage >= ${FRAME_SIDE_COVERAGE_MIN * 100}%)`
        : `GHOST FRAME (side coverage >= ${GHOST_SIDE_COVERAGE_MIN * 100}%)`
    );
  console.log(
    r.rel.padEnd(36),
    String(r.solidPx).padStart(9),
    String(r.interiorPx).padStart(12),
    String(r.biggestBlob).padStart(13),
    String(r.ringDepth).padStart(11),
    `${(r.frameCoverage * 100).toFixed(1)}%`.padStart(12),
    `${(r.ghostCoverage * 100).toFixed(1)}%`.padStart(11),
    ' ',
    problems.length ? problems.join(' + ') : 'ok'
  );
}
const offenders = rows.filter((r) => !r.passes);
const solidOffenders = rows.filter((r) => !r.solidOk).length;
const ringOffenders = rows.filter((r) => !r.ringsOk).length;
const frameOffenders = rows.filter((r) => !r.frameOk).length;
console.log(
  `\n${offenders.length}/${rows.length} outline(s) need attention · ` +
    `${solidOffenders} solid · ${ringOffenders} over-ringed · ${frameOffenders} page frame(s)`
);
if (solidOffenders || ringOffenders) {
  console.log(
    'Normalize solid/over-ringed outlines: npm run gen:coloring-outlines:normalize -- <page>'
  );
}
if (frameOffenders) {
  console.log(
    'For framed -tall/-wide pages, supply a scene and generate a fresh outline: ' +
      'npm run gen:coloring-outlines:fresh -- <page> --scene "<description>"'
  );
}
if (errors) process.exitCode = 1;
