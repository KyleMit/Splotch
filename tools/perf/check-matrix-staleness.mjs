// Fail when a matrix cell that CLAIMS to be a current measurement was captured
// from product source that has since changed.
//
//   npm run check:matrix-staleness
//   npm run check:matrix-staleness -- --manifest=<sources.json> --base=HEAD
//
// The performance matrix records the product commit each cell was captured at,
// and nothing compared it to the branch. That gap is not theoretical: on
// 2026-08-22 `ipad-device-web` was captured at ae674d71 and four further commits
// to the drawing engine landed the same evening, so the published rows — and the
// epic citing them as the one target on the corrected metric — described a build
// nobody was running. It took a physical-device A/B to notice.
//
// A PRESERVED cell is exempt by construction: it is already labelled historical
// evidence carried forward. What this checks is the other kind — a cell folded in
// from a real capture, which is making a claim about the product as it stands.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';

const DEFAULT_MANIFEST = 'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json';

// The product surface a capture actually measures. An enumerated *directory* scope
// was tried first and missed by the margin an enumeration always does: gating on
// `web/src/lib/drawing` reported "current" across a commit that changed
// DrawingCanvas.svelte and drawing-audio scheduling. Widening to `web/src` alone
// then missed the next one — 105c23bd..a347da5e has an identical `web/src` tree and
// changes three pencil sound assets, which a drawing capture plays.
//
// So the fingerprint spans source, the static assets served with it, and the build
// inputs that decide what the bundle contains. Two deliberate absences, both for
// the same reason — a check that fires on changes which cannot move a frame is one
// people learn to ignore. `web/tests` is excluded because a spec cannot affect the
// product. `package.json` is excluded in favour of `pnpm-lock.yaml`: the lockfile
// moves when dependencies do, while package.json also moves for every script
// added, which would mark every capture stale the next time the harness is
// touched — including by this campaign's own commits.
export const MEASURED_SURFACE = [
  'web/src',
  'web/static',
  'web/svelte.config.js',
  'web/vite.config.ts',
  'pnpm-lock.yaml',
];

// Every provenance field a mode carries, so undo and action captures are held to
// the same standard as drawing rather than going unchecked.
export function modeProvenance(mode) {
  const commits = new Set();
  if (typeof mode.drawing !== 'string' && mode.drawing && mode.drawingProductCommit) {
    commits.add(mode.drawingProductCommit);
  }
  if (typeof mode.undoSource !== 'string' || mode.undoSource !== 'preserved') {
    if (mode.undoProductCommit) commits.add(mode.undoProductCommit);
  }
  if (Array.isArray(mode.actionSources)) {
    for (const source of mode.actionSources) {
      if (source?.productCommit) commits.add(source.productCommit);
    }
  }
  return [...commits];
}

export function capturedCommits(target) {
  const commits = new Set();
  for (const mode of target.modes ?? []) {
    for (const commit of modeProvenance(mode)) commits.add(commit);
  }
  return [...commits];
}

export function assessManifest(manifest, { surfaceAt, commitsSince }) {
  const current = surfaceAt('HEAD');
  const rows = [];
  for (const target of manifest.targets ?? []) {
    for (const commit of capturedCommits(target)) {
      const surface = surfaceAt(commit);
      const verdict = !surface ? 'UNVERIFIABLE' : surface === current ? 'current' : 'STALE';
      rows.push({
        target: target.id,
        capturedAt: commit.slice(0, 12),
        'measured surface': surface ? surface.slice(0, 12) : '(unreachable)',
        'engine commits since': commitsSince ? commitsSince(commit) : undefined,
        verdict,
      });
    }
  }
  return rows;
}

function gitSurfaceReader(base) {
  const at = (commit, path) => {
    try {
      return execFileSync('git', ['rev-parse', `${commit}:${path}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
    } catch {
      // The path did not exist at that commit. That is a real difference in the
      // measured surface, not an unreadable one — the commit itself was already
      // proven reachable below.
      return 'absent';
    }
  };
  return (commitOrBase) => {
    const commit = commitOrBase === 'HEAD' ? base : commitOrBase;
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    } catch {
      // Unreachable is UNVERIFIABLE, never "current" — a shallow clone makes every
      // lookup fail, and reporting the matrix current there is the failure shape
      // this exists to end.
      return null;
    }
    return MEASURED_SURFACE.map((path) => `${path}=${at(commit, path)}`).join(' ');
  };
}

function engineCommitCounter(base) {
  return (commit) => {
    try {
      return Number(
        execFileSync(
          'git',
          ['rev-list', '--count', `${commit}..${base}`, '--', 'web/src/lib/drawing'],
          { cwd: ROOT, encoding: 'utf8' }
        ).trim()
      );
    } catch {
      return undefined;
    }
  };
}

export async function checkMatrixStaleness({
  manifestPath = argFlag('manifest', DEFAULT_MANIFEST),
  base = argFlag('base', 'HEAD'),
} = {}) {
  const manifest = JSON.parse(readFileSync(`${ROOT}/${manifestPath}`, 'utf8'));
  const rows = assessManifest(manifest, {
    surfaceAt: gitSurfaceReader(base),
    commitsSince: engineCommitCounter(base),
  });
  if (!rows.length) {
    console.log('No captured cells in the manifest — every target is preserved evidence.');
    return { rows, stale: [] };
  }
  console.table(rows);

  const unverifiable = rows.filter((row) => row.verdict === 'UNVERIFIABLE');
  if (unverifiable.length) {
    fail(
      `${unverifiable.length} capture commit(s) are not reachable from ${base}: ` +
        `${unverifiable.map((row) => `${row.target} (${row.capturedAt})`).join(', ')}. ` +
        'A shallow clone is the usual cause — this needs the referenced commits fetched. ' +
        'Refusing to report "current" for a commit that could not be checked.'
    );
  }

  const stale = rows.filter((row) => row.verdict === 'STALE');
  if (stale.length) {
    fail(
      `${stale.length} target(s) publish a capture taken from a product surface that has since ` +
        `changed: ${stale.map((row) => `${row.target} (${row.capturedAt})`).join(', ')}. ` +
        'Recapture them, or mark those modes preserved so they stop claiming currency.'
    );
  }
  console.log(`\n${rows.length} captured cell group(s), all from the current product surface.`);
  return { rows, stale };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await checkMatrixStaleness();
  });
}
