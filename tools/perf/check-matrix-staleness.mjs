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

// The whole client source tree, because that is what a capture measures. An
// enumerated scope was tried first and missed by exactly the margin an enumeration
// always does: gating on `web/src/lib/drawing` reported "current" across a commit
// that changed DrawingCanvas.svelte and the drawing-audio scheduling, both on the
// measured interaction path. A tree digest cannot miss a file nobody thought of.
export const MEASURED_TREE = 'web/src';

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

export function assessManifest(manifest, { treeAt, commitsSince }) {
  const current = treeAt('HEAD_TREE');
  const rows = [];
  for (const target of manifest.targets ?? []) {
    for (const commit of capturedCommits(target)) {
      const tree = treeAt(commit);
      const verdict = !tree ? 'UNVERIFIABLE' : tree === current ? 'current' : 'STALE';
      rows.push({
        target: target.id,
        capturedAt: commit.slice(0, 12),
        [`${MEASURED_TREE} tree`]: tree ? tree.slice(0, 12) : '(unreachable)',
        'engine commits since': commitsSince ? commitsSince(commit) : undefined,
        verdict,
      });
    }
  }
  return rows;
}

function gitTreeReader(base) {
  const currentTree = (() => {
    try {
      return execFileSync('git', ['rev-parse', `${base}:${MEASURED_TREE}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
    } catch {
      return null;
    }
  })();
  return (commit) => {
    if (commit === 'HEAD_TREE') return currentTree;
    try {
      return execFileSync('git', ['rev-parse', `${commit}:${MEASURED_TREE}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
    } catch {
      // Unreachable is UNVERIFIABLE, never "current" — a shallow clone makes every
      // lookup fail, and reporting the matrix current there is the failure shape
      // this exists to end.
      return null;
    }
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
    treeAt: gitTreeReader(base),
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
      `${stale.length} target(s) publish a capture taken from ${MEASURED_TREE} that has since ` +
        `changed: ${stale.map((row) => `${row.target} (${row.capturedAt})`).join(', ')}. ` +
        'Recapture them, or mark those modes preserved so they stop claiming currency.'
    );
  }
  console.log(`\n${rows.length} captured cell group(s), all from the current ${MEASURED_TREE}.`);
  return { rows, stale };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await checkMatrixStaleness();
  });
}
