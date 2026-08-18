// Golden-set regression fixtures for the coloring catalog. Every cheap offline
// audit score the pipeline computes — outline solidity, eye-ring depth, and frame coverage
// (check-outline-quality.mjs), light-fill outline keep/localKeep
// (check-fill-drift.mjs), light/night eye + blank-orb verdicts (check-fill-eyes.mjs),
// and the night fill's drift/bgLuma/lineWhite generation gates
// (lib/night-scores.mjs) — frozen into one committed JSON
// (golden/golden-scores.json), so any pipeline change can re-run the audits and
// diff against the snapshot: "improved train-wide" can't silently degrade
// any other page.
//
//   npm run update:coloring-golden-scores   score the whole catalog -> golden/golden-scores.json
//   npm run check:coloring-golden-scores     re-score and diff; exit 1 on any regression
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
import {
  ASSET_GEN_DIR,
  COLORING_DIR,
  FILL_SRC_DIR,
  resolveNightLineArt,
  toPosix,
} from '../lib/asset-paths.mjs';
import { fail } from '../lib/asset-cli.mjs';
import { KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { SOLID_BLOB_MAX, SOLID_INTERIOR_MAX } from '../lib/solid-regions.mjs';
import { EYE_RING_DEPTH_MAX } from '../lib/eye-fill.mjs';
import {
  FRAME_SIDE_COVERAGE_MIN,
  GHOST_LUMA_MAX,
  GHOST_SIDE_COVERAGE_MIN,
} from '../lib/outline-frame.mjs';
import { GOLDEN_VERDICTS, diffGoldenPage, scoreGoldenPage } from '../lib/golden-catalog.mjs';
import {
  DRIFT_THRESHOLD_DEFAULT,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';

export const GOLDEN_PATH = join(ASSET_GEN_DIR, 'golden', 'golden-scores.json');
const CONCURRENCY = 4;

// Score one page: the pen outline always, the raw fills when committed.
async function scorePage(outlinePath) {
  const rel = toPosix(relative(COLORING_DIR, outlinePath).replace(/\.outline\.webp$/, ''));
  const pen = await readFile(outlinePath);

  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const lightRaw = existsSync(lightPath) ? await readFile(lightPath) : null;

  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  let nightRaw = null;
  let chalk = null;
  if (existsSync(nightPath)) {
    nightRaw = await readFile(nightPath);
    // Score against the line art the fill must sit under: the chalk when the
    // page has forked, else the pen — mirroring gen-night-fills.mjs.
    ({ chalk } = await resolveNightLineArt(outlinePath, pen));
  }

  const entry = await scoreGoldenPage({ page: rel, pen, lightRaw, nightRaw, chalk });
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
  const erroredPages = new Set();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, outlines.length) }, async () => {
      while (next < outlines.length) {
        const path = outlines[next++];
        try {
          const [rel, entry] = await scorePage(path);
          results.set(rel, entry);
        } catch (error) {
          const rel = toPosix(relative(COLORING_DIR, path).replace(/\.outline\.webp$/, ''));
          console.error(
            `${rel}  ERROR (${error instanceof Error ? error.message : String(error)})`
          );
          erroredPages.add(rel);
        }
      }
    })
  );

  const pages = {};
  for (const rel of [...results.keys()].sort()) pages[rel] = results.get(rel);
  return {
    catalog: {
      version: 4,
      thresholds: {
        keep: KEEP_THRESHOLD,
        localKeep: LOCAL_KEEP_THRESHOLD,
        nightDriftMax: DRIFT_THRESHOLD_DEFAULT,
        bgLumaMax: NIGHT_BG_LUMA_MAX_DEFAULT,
        lineWhiteMin: LINE_WHITE_MIN_DEFAULT,
        solidBlobMax: SOLID_BLOB_MAX,
        solidInteriorMax: SOLID_INTERIOR_MAX,
        eyeRingDepthMax: EYE_RING_DEPTH_MAX,
        frameSideCoverageMin: FRAME_SIDE_COVERAGE_MIN,
        ghostLumaMax: GHOST_LUMA_MAX,
        ghostSideCoverageMin: GHOST_SIDE_COVERAGE_MIN,
      },
      pages,
    },
    errors: erroredPages.size,
    erroredPages,
  };
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const mode = process.argv[2];
if (mode !== '--freeze' && mode !== '--diff' && mode !== undefined)
  fail('usage: check-golden-scores.mjs [--freeze | --diff]   (default: --diff)');

const t0 = performance.now();
const { catalog: current, errors, erroredPages } = await scoreCatalog();
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
const pageCount = Object.keys(current.pages).length;

if (mode === '--freeze') {
  if (errors) {
    console.log(
      `Skipped freeze after scoring ${pageCount} page(s) in ${elapsed}s; ${errors} page(s) errored and ${relative(process.cwd(), GOLDEN_PATH)} was not changed.`
    );
    process.exitCode = 1;
  } else {
    await mkdir(dirname(GOLDEN_PATH), { recursive: true });
    await writeFile(GOLDEN_PATH, JSON.stringify(current, null, 2) + '\n');
    const fails = Object.entries(current.pages).flatMap(([rel, p]) =>
      GOLDEN_VERDICTS.filter((v) => get(p, v) === false).map((v) => `${rel}  ${v}`)
    );
    console.log(
      `Froze ${pageCount} page(s) in ${elapsed}s -> ${relative(process.cwd(), GOLDEN_PATH)}`
    );
    if (fails.length) {
      console.log(`\n${fails.length} known-failing verdict(s) frozen as the baseline:`);
      for (const f of fails) console.log(`  ${f}`);
    }
  }
} else {
  if (!existsSync(GOLDEN_PATH))
    fail(`no golden file at ${GOLDEN_PATH} — run update:coloring-golden-scores first`);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf8'));
  const out = { regressions: [], improvements: [], info: [] };
  if (golden.version !== current.version)
    out.regressions.push(
      `catalog schema version ${golden.version} -> ${current.version} (re-freeze required)`
    );
  for (const rel of Object.keys(golden.pages)) {
    if (!current.pages[rel]) {
      if (!erroredPages.has(rel)) out.regressions.push(`${rel}  page missing (was in golden set)`);
    } else {
      diffGoldenPage(rel, golden.pages[rel], current.pages[rel], out);
    }
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
  if (out.regressions.length || errors) process.exitCode = 1;
  else if (!out.improvements.length && !out.info.length)
    console.log('Clean — no drift from the golden set.');
}
