// Audit every committed RAW colored fill (`fill-src/**/*.{light,night}.raw.webp`)
// for registration against the line art it ships under. Light fills retain the
// outlineMatch coverage gate; both themes run the local-warp scorer used by their
// generators. The scorer reports residual rigid translation separately from a
// feature that bent or moved on its own.
//
// This flags those already-committed fills so they can be regenerated
// (`npm run gen:coloring-fills -- <page> --apply`; the bare command only writes a
// review candidate to scratch), and re-run afterwards to confirm the fix. It reads
// committed assets only — no network, no GEMINI_API_KEY — so it's
// safe to run anytime.
//
//   npm run check:coloring-fill-drift                 audit every fill
//   npm run check:coloring-fill-drift -- nature farm  only these categories
//   npm run check:coloring-fill-drift -- nature/ant-wide
//   npm run check:coloring-fill-drift -- --overlay    also write drift overlays
//   npm run check:coloring-fill-drift -- --warp-max 5 reviewed override
//
// Exits non-zero if any fill fails, so it doubles as a check.
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fail, parseNonNegative } from '../lib/asset-cli.mjs';
import {
  REPO_ROOT,
  COLORING_DIR,
  FILL_SRC_DIR,
  SAMPLES_DIR,
  resolveNightLineArt,
} from '../lib/asset-paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';
import { LOCAL_WARP_MAX_PX, localWarp } from '../lib/local-warp.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { overlay: { type: 'boolean' }, 'warp-max': { type: 'string' } },
});
const warpMax = parseNonNegative(values['warp-max'], '--warp-max', LOCAL_WARP_MAX_PX);

const pages = await resolveOutlineTargets(positionals, {
  includeCovers: false,
  explicitFiles: true,
  sort: 'all',
  defaultAll: true,
  onMissing: 'defer',
});

const overlayDir = join(SAMPLES_DIR, 'drift');
if (values.overlay) await mkdir(overlayDir, { recursive: true });

const rows = [];
let errors = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '');
  const pen = await readFile(page);
  for (const theme of ['light', 'night']) {
    const fill = join(FILL_SRC_DIR, `${rel}.${theme}.raw.webp`);
    if (!existsSync(fill)) continue;
    try {
      const filled = await readFile(fill);
      const source = theme === 'night' ? (await resolveNightLineArt(page, pen)).source : pen;
      const warp = await localWarp(source, filled);
      const match = theme === 'light' ? await outlineMatch(source, filled) : null;
      const outlineFailed =
        match !== null && (match.keep < KEEP_THRESHOLD || match.localKeep < LOCAL_KEEP_THRESHOLD);
      const warpFailed = warp.localWarpMax > warpMax;
      rows.push({
        rel,
        theme,
        match,
        warp,
        outlineFailed,
        warpFailed,
        failed: outlineFailed || warpFailed,
      });
      if (values.overlay && outlineFailed) {
        const { overlay } = await outlineMatch(source, filled, { overlay: true });
        const out = join(overlayDir, `${rel.replace(/\//g, '-')}.overlay.png`);
        await writeFile(out, overlay);
      }
    } catch (error) {
      console.error(
        `${rel} ${theme}  ERROR (${error instanceof Error ? error.message : String(error)})`
      );
      errors++;
    }
  }
}

if (!rows.length && !errors) fail('No colored fills found for the given pages.');

// Worst first, so drift is at the top.
rows.sort((a, b) => b.warp.localWarpMax - a.warp.localWarpMax);
const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);
console.log(
  `${'page'.padEnd(28)} ${'theme'.padEnd(5)} ${'keep'.padStart(6)} ${'worstTile'.padStart(9)} ${'warp'.padStart(7)} ${'residual'.padStart(9)}  where`
);
for (const r of rows) {
  const where = r.warp.worstTile
    ? `tile ${r.warp.worstTile.x},${r.warp.worstTile.y} (${r.warp.worstTile.confidence})`
    : '';
  const keep = r.match ? pct(r.match.keep) : '     -';
  const localKeep = r.match ? pct(r.match.localKeep) : '        -';
  const residual = `${r.warp.globalDx},${r.warp.globalDy}`.padStart(9);
  const flag = r.failed
    ? `  ⚠ ${r.warpFailed ? 'LOCAL WARP' : 'DRIFT'} — regenerate`
    : r.warp.localWarpMax >= 3
      ? '  ⚠ warp review'
      : '';
  console.log(
    `${r.rel.padEnd(28)} ${r.theme.padEnd(5)} ${keep} ${localKeep} ${`${r.warp.localWarpMax.toFixed(1)}px`.padStart(7)} ${residual}  ${where}${flag}`
  );
}

const bad = rows.filter((r) => r.failed);
console.log(
  `\n${rows.length} fill(s) audited · ${bad.length} flagged` +
    ` (light keep < ${pct(KEEP_THRESHOLD).trim()}, light worst tile < ${pct(LOCAL_KEEP_THRESHOLD).trim()}, or local warp > ${warpMax}px).`
);
if (values.overlay && bad.length) {
  console.log(
    `Drift overlays: ${relative(REPO_ROOT, overlayDir)}/  (red = drifted source outline)`
  );
}
if (bad.length) {
  console.log(
    `Regenerate flagged pages with the matching light/night fill generator: ${[...new Set(bad.map((r) => r.rel))].join(' ')}`
  );
  process.exitCode = 1;
}
if (errors) process.exitCode = 1;
