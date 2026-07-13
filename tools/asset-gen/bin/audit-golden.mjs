// Golden-set regression fixtures for the coloring catalog. Every cheap offline
// audit score the pipeline computes — outline solidity + eye-ring depth
// (audit-outline-solidity.mjs), light-fill outline keep/localKeep
// (check-coloring-drift.mjs), light/night eye verdicts (audit-fill-eyes.mjs),
// and the night fill's drift/bgLuma/lineWhite generation gates
// (lib/night-scores.mjs) — frozen into one committed JSON
// (golden/golden-scores.json), so any pipeline change can re-run the audits and
// diff against the snapshot: "improved train-wide" can't silently degrade the
// other 93 pages.
//
//   npm run gen:coloring-golden:freeze   score the whole catalog -> golden/golden-scores.json
//   npm run gen:coloring-golden:diff     re-score and diff; exit 1 on any regression
//
// Deterministic (pure sharp + integer math on committed assets), no API
// key/network. A no-op diff is exact: scores are rounded before both freeze and
// compare, so byte-identical inputs produce byte-identical golden files. The
// diff's noise thresholds only absorb future environment shifts (e.g. a sharp
// upgrade changing a decode by a hair) — verdict flips always count.
//
// The golden set guards quality METRICS, not content identity: two clean
// renders can be score-identical. Byte identity is the sibling fixture's job —
// golden/asset-manifest.sha256 (gen-asset-manifest.mjs) is the content-hash
// column that catches score-invisible asset swaps.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ASSET_GEN_DIR, COLORING_DIR, FILL_SRC_DIR, fail } from '../lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { scoreSolidity, SOLID_BLOB_MAX, SOLID_INTERIOR_MAX } from '../lib/solid-regions.mjs';
import {
  scoreEyeRings,
  EYE_RING_DEPTH_MAX,
  scoreEyeFill,
  judgeLightEyes,
  judgeNightEyes,
} from '../lib/eye-fill.mjs';
import { compositeNight } from '../lib/night-composite.mjs';
import {
  scoreDrift,
  scoreNightness,
  scoreLineColor,
  DRIFT_THRESHOLD_DEFAULT,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';

export const GOLDEN_PATH = join(ASSET_GEN_DIR, 'golden', 'golden-scores.json');
const CONCURRENCY = 4;

const round = (v, digits) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

// Score one page: the pen outline always, the raw fills when committed.
async function scorePage(outlinePath) {
  const rel = relative(COLORING_DIR, outlinePath)
    .replace(/\.outline\.webp$/, '')
    .replace(/\\/g, '/');
  const pen = await readFile(outlinePath);

  const solidity = await scoreSolidity(pen);
  const rings = await scoreEyeRings(pen);
  const outline = {
    darkPx: solidity.darkPx,
    interiorPx: solidity.interiorPx,
    solidPx: solidity.solidPx,
    biggestBlob: solidity.biggestBlob,
    strokeWidth: solidity.strokeWidth,
    ringDepth: rings.maxDepth,
    solidOk: solidity.passes,
    ringsOk: rings.passes,
  };

  const entry = { outline };

  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  let lightEyes = null;
  if (existsSync(lightPath)) {
    const lightRaw = await readFile(lightPath);
    const { keep, localKeep, worstTile } = await outlineMatch(pen, lightRaw);
    lightEyes = await scoreEyeFill(lightRaw, pen);
    entry.light = {
      keep: round(keep, 4),
      localKeep: round(localKeep, 4),
      worstTile: worstTile ? `${worstTile.x},${worstTile.y}` : null,
      eyeCores: lightEyes.cores.length,
      eyeLively: lightEyes.cores.filter((c) => c.lively).length,
      driftOk: keep >= KEEP_THRESHOLD && localKeep >= LOCAL_KEEP_THRESHOLD,
      eyesOk: judgeLightEyes(lightEyes).passes,
    };
  }

  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  if (existsSync(nightPath)) {
    const nightRaw = await readFile(nightPath);
    // Score against the line art the fill must sit under: the chalk when the
    // page has forked, else the pen — mirroring gen-coloring-fills-dark.mjs.
    const chalkPath = outlinePath.replace(/\.outline\.webp$/, '.chalk.webp');
    const chalk = existsSync(chalkPath) ? await readFile(chalkPath) : null;
    const source = chalk ?? pen;
    const [drift, night, line] = await Promise.all([
      scoreDrift(nightRaw, source),
      scoreNightness(nightRaw, source),
      scoreLineColor(nightRaw, source),
    ]);
    // Eyes judge the simulated final composite when a chalk owns the whites;
    // the light fill is the reference for which cores are real eyes.
    let eyes = null;
    if (lightEyes) {
      const judged = chalk ? await compositeNight(nightRaw, chalk) : nightRaw;
      eyes = judgeNightEyes(await scoreEyeFill(judged, pen), lightEyes, { chalked: !!chalk });
    }
    entry.night = {
      drift: round(drift.ratio, 5),
      bgLuma: round(night.bgLuma, 1),
      lineWhite: round(line.lineWhite, 1),
      eyesFailed: eyes ? eyes.failed : null,
      driftOk: drift.ratio <= DRIFT_THRESHOLD_DEFAULT,
      moodOk: night.bgLuma <= NIGHT_BG_LUMA_MAX_DEFAULT,
      lineOk: line.lineWhite >= LINE_WHITE_MIN_DEFAULT,
      eyesOk: eyes ? eyes.passes : null,
    };
  }

  return [rel, entry];
}

async function scoreCatalog() {
  const outlines = [];
  for await (const entry of glob('**/*.outline.webp', { cwd: COLORING_DIR }))
    outlines.push(join(COLORING_DIR, entry));
  outlines.sort();
  if (!outlines.length) fail(`no line art found under ${COLORING_DIR}`);

  const results = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, outlines.length) }, async () => {
      while (next < outlines.length) {
        const path = outlines[next++];
        const [rel, entry] = await scorePage(path);
        results.set(rel, entry);
      }
    })
  );

  const pages = {};
  for (const rel of [...results.keys()].sort()) pages[rel] = results.get(rel);
  return {
    version: 1,
    thresholds: {
      keep: KEEP_THRESHOLD,
      localKeep: LOCAL_KEEP_THRESHOLD,
      nightDriftMax: DRIFT_THRESHOLD_DEFAULT,
      bgLumaMax: NIGHT_BG_LUMA_MAX_DEFAULT,
      lineWhiteMin: LINE_WHITE_MIN_DEFAULT,
      solidBlobMax: SOLID_BLOB_MAX,
      solidInteriorMax: SOLID_INTERIOR_MAX,
      eyeRingDepthMax: EYE_RING_DEPTH_MAX,
    },
    pages,
  };
}

// Numeric fields: how much movement is noise, and which direction is WORSE.
// Verdict (boolean) fields always gate on ok->fail regardless of these.
const METRICS = {
  'outline.darkPx': { noise: 0, worse: null },
  'outline.interiorPx': { noise: 15, worse: 'up' },
  'outline.solidPx': { noise: 30, worse: null },
  'outline.biggestBlob': { noise: 15, worse: 'up' },
  'outline.strokeWidth': { noise: 0, worse: null },
  'outline.ringDepth': { noise: 0, worse: 'up' },
  'light.keep': { noise: 0.005, worse: 'down' },
  'light.localKeep': { noise: 0.005, worse: 'down' },
  'light.eyeCores': { noise: 0, worse: null },
  'light.eyeLively': { noise: 0, worse: 'down' },
  'night.drift': { noise: 0.001, worse: 'up' },
  'night.bgLuma': { noise: 3, worse: 'up' },
  'night.lineWhite': { noise: 3, worse: 'down' },
  'night.eyesFailed': { noise: 0, worse: 'up' },
};
const VERDICTS = [
  'outline.solidOk',
  'outline.ringsOk',
  'light.driftOk',
  'light.eyesOk',
  'night.driftOk',
  'night.moodOk',
  'night.lineOk',
  'night.eyesOk',
];
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function diffPage(rel, golden, current, out) {
  for (const path of VERDICTS) {
    const was = get(golden, path);
    const now = get(current, path);
    if (was === now || was === undefined || now === undefined) continue;
    if (was === null || now === null) {
      out.info.push(`${rel}  ${path} ${was} -> ${now} (scoreability changed)`);
    } else if (was && !now) {
      out.regressions.push(`${rel}  ${path} ok -> FAIL`);
    } else {
      out.improvements.push(`${rel}  ${path} FAIL -> ok`);
    }
  }
  for (const [path, spec] of Object.entries(METRICS)) {
    const was = get(golden, path);
    const now = get(current, path);
    if (was == null || now == null || was === now) continue;
    const delta = now - was;
    if (Math.abs(delta) <= spec.noise) continue;
    const line = `${rel}  ${path} ${was} -> ${now}`;
    const worse = spec.worse === 'up' ? delta > 0 : spec.worse === 'down' ? delta < 0 : false;
    (worse ? out.regressions : out.info).push(line + (worse ? '' : ' (moved)'));
  }
}

const mode = process.argv[2];
if (mode !== '--freeze' && mode !== '--diff' && mode !== undefined)
  fail('usage: audit-golden.mjs [--freeze | --diff]   (default: --diff)');

const t0 = performance.now();
const current = await scoreCatalog();
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
const pageCount = Object.keys(current.pages).length;

if (mode === '--freeze') {
  await mkdir(dirname(GOLDEN_PATH), { recursive: true });
  await writeFile(GOLDEN_PATH, JSON.stringify(current, null, 2) + '\n');
  const fails = Object.entries(current.pages).flatMap(([rel, p]) =>
    VERDICTS.filter((v) => get(p, v) === false).map((v) => `${rel}  ${v}`)
  );
  console.log(
    `Froze ${pageCount} page(s) in ${elapsed}s -> ${relative(process.cwd(), GOLDEN_PATH)}`
  );
  if (fails.length) {
    console.log(`\n${fails.length} known-failing verdict(s) frozen as the baseline:`);
    for (const f of fails) console.log(`  ${f}`);
  }
} else {
  if (!existsSync(GOLDEN_PATH))
    fail(`no golden file at ${GOLDEN_PATH} — run gen:coloring-golden:freeze first`);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf8'));
  const out = { regressions: [], improvements: [], info: [] };
  for (const rel of Object.keys(golden.pages)) {
    if (!current.pages[rel]) out.regressions.push(`${rel}  page missing (was in golden set)`);
    else diffPage(rel, golden.pages[rel], current.pages[rel], out);
  }
  for (const rel of Object.keys(current.pages))
    if (!golden.pages[rel])
      out.info.push(`${rel}  new page (not in golden set — re-freeze to adopt)`);

  const section = (title, rows) => {
    if (!rows.length) return;
    console.log(`\n${title}:`);
    for (const r of rows.sort()) console.log(`  ${r}`);
  };
  section('REGRESSIONS', out.regressions);
  section('IMPROVEMENTS (re-freeze to adopt)', out.improvements);
  section('MOVEMENTS / INFO', out.info);
  console.log(
    `\n${pageCount} page(s) diffed vs golden in ${elapsed}s · ` +
      `${out.regressions.length} regression(s) · ${out.improvements.length} improvement(s) · ${out.info.length} other change(s).`
  );
  if (out.regressions.length) process.exitCode = 1;
  else if (!out.improvements.length && !out.info.length)
    console.log('Clean — no drift from the golden set.');
}
