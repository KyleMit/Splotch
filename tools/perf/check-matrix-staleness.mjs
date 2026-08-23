// Fail when a matrix cell that CLAIMS to be a current measurement was captured
// before the code it measures changed.
//
//   npm run check:matrix-staleness
//   npm run check:matrix-staleness -- --manifest=<sources.json> --base=HEAD
//
// The performance matrix records the product commit each cell was captured at,
// and nothing has ever compared it to the branch. That gap is not theoretical:
// on 2026-08-22 `ipad-device-web` was captured at ae674d71 and four further
// commits to the drawing engine landed the same evening, so the published rows —
// and the epic that cited them as the one target on the corrected metric —
// described a build nobody was running. It took a physical-device A/B to notice.
//
// A PRESERVED cell is exempt by construction: it is already labelled historical
// evidence carried forward, so being behind is what it says it is. What this
// checks is the other kind — a cell folded in from a real capture, which is
// making a claim about the product as it stands.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';

const DEFAULT_MANIFEST = 'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json';

// The drawing gates measure the engine, so a commit there is what makes a cell's
// number stale. `web/src` is reported alongside it for context rather than gated
// on: a change to /admin cannot move a drawing frame, and gating on it would make
// every capture stale within a day and train everyone to ignore this.
export const ENGINE_PATH = 'web/src/lib/drawing';
export const APP_PATH = 'web/src';

// A mode whose `drawing` is a string is preserved evidence; one carrying paths was
// folded in from a capture and is therefore claiming currency.
export function capturedCommits(target) {
  const commits = new Set();
  for (const mode of target.modes ?? []) {
    if (typeof mode.drawing === 'string' || !mode.drawing) continue;
    if (mode.drawingProductCommit) commits.add(mode.drawingProductCommit);
  }
  return [...commits];
}

export function assessManifest(manifest, commitsSince) {
  const rows = [];
  for (const target of manifest.targets ?? []) {
    for (const commit of capturedCommits(target)) {
      const engine = commitsSince(commit, ENGINE_PATH);
      rows.push({
        target: target.id,
        capturedAt: commit.slice(0, 12),
        [`${ENGINE_PATH} commits since`]: engine,
        [`${APP_PATH} commits since`]: commitsSince(commit, APP_PATH),
        verdict: Number.isNaN(engine) ? 'UNVERIFIABLE' : engine > 0 ? 'STALE' : 'current',
      });
    }
  }
  return rows;
}

function countCommitsSince(base) {
  return (commit, path) => {
    try {
      const out = execFileSync('git', ['rev-list', '--count', `${commit}..${base}`, '--', path], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      return Number(out.trim());
    } catch {
      // An unreachable commit is not "current" — it is UNVERIFIABLE, and the whole
      // point of this check is that "no error" must never read as "fine". The
      // common cause is a shallow clone: `actions/checkout` fetches depth 1 by
      // default, and every rev-list against a real commit then fails.
      return Number.NaN;
    }
  };
}

export async function checkMatrixStaleness({
  manifestPath = argFlag('manifest', DEFAULT_MANIFEST),
  base = argFlag('base', 'HEAD'),
} = {}) {
  const manifest = JSON.parse(readFileSync(`${ROOT}/${manifestPath}`, 'utf8'));
  const rows = assessManifest(manifest, countCommitsSince(base));
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
        'A shallow clone is the usual cause — this needs full history (fetch-depth: 0). ' +
        'Refusing to report "current" for a commit that could not be checked.'
    );
  }

  const stale = rows.filter((row) => row.verdict === 'STALE');
  if (stale.length) {
    fail(
      `${stale.length} target(s) publish a capture taken before ${ENGINE_PATH} changed: ` +
        `${stale.map((row) => `${row.target} (${row.capturedAt})`).join(', ')}. ` +
        'Recapture them, or mark those modes preserved so they stop claiming currency.'
    );
  }
  console.log(`\n${rows.length} captured cell group(s), none behind ${ENGINE_PATH}.`);
  return { rows, stale };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await checkMatrixStaleness();
  });
}
