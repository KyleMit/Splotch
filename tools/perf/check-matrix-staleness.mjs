// Report when a matrix cell that CLAIMS to be a current measurement was captured
// from product source that has since changed; fail on it only under --strict.
//
//   npm run check:matrix-staleness
//   npm run check:matrix-staleness -- --manifest=<sources.json> --base=HEAD
//   npm run check:matrix-staleness -- --strict
//
// The performance matrix records the product commit each cell was captured at,
// and nothing compared it to the branch. That gap is not theoretical: on
// 2026-08-22 `ipad-device-web` was captured at ae674d71 and four further commits
// to the drawing engine landed the same evening, so the published rows — and the
// epic citing them as the one target on the corrected metric — described a build
// nobody was running. It took a physical-device A/B to notice.
//
// Rows go stale by design between campaigns: the suite is far too expensive to
// run on every product commit, so the matrix is refreshed periodically by a
// campaign (ADR-0159). A STALE row is therefore the normal state of a committed
// matrix, and the default run reports it without failing. The failure this check
// exists to end is a campaign CITING a stale row as current, and the remedy is
// the drift being visible at every regeneration — not a generator that is red
// for every commit between campaigns. `--strict` is for the regenerate where a
// campaign asserts that every captured row is current.
//
// A PRESERVED cell is exempt by construction: it is already labelled historical
// evidence carried forward. A CAPTURED-UNTRACKED cell is different: its raw source
// is absent from git, but it still claims currency and therefore remains checked.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';

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

// `web/tests` is excluded above on the principle that a spec cannot affect the
// product. This repo colocates unit tests beside their source, so most specs are
// under `web/src` and that exclusion missed them — which is not a hypothetical
// margin. On 2026-08-23 a comment edit inside `web/src/lib/icons/tokenFallback.
// test.ts` was the entire difference between five matrix targets and the current
// tree, marking 100 cells stale and exiting the generator 1 on every regeneration
// from then on.
//
// A tree hash cannot express "except these files", so the exception is applied
// where the hashes already differ: name the differing files and ask whether any
// of them ships. Any real source change still reads STALE, and a commit touching
// both a spec and a source file reads STALE on the source file.
export const SPEC_FILE = /\.(test|spec)\.[^.]+$/;

export function everyChangeIsASpec(paths) {
  return paths.length > 0 && paths.every((path) => SPEC_FILE.test(path));
}

// Every provenance field a mode carries, so undo and action captures are held to
// the same standard as drawing rather than going unchecked.
export function modeProvenance(mode) {
  const commits = new Set();
  if (mode.drawing !== 'preserved' && mode.drawing && mode.drawingProductCommit) {
    commits.add(mode.drawingProductCommit);
  }
  if (mode.undoSource !== 'preserved') {
    if (mode.undoProductCommit) commits.add(mode.undoProductCommit);
  }
  if (mode.actionSources === 'captured-untracked') {
    const actionCommit = mode.actionProductCommit ?? mode.drawingProductCommit;
    if (actionCommit) commits.add(actionCommit);
  } else if (Array.isArray(mode.actionSources)) {
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

export function assessManifest(manifest, { surfaceAt, commitsSince, changedFilesSince }) {
  const current = surfaceAt('HEAD');
  const rows = [];
  for (const target of manifest.targets ?? []) {
    for (const commit of capturedCommits(target)) {
      const surface = surfaceAt(commit);
      const specsOnly =
        surface && surface !== current && changedFilesSince
          ? everyChangeIsASpec(changedFilesSince(commit))
          : false;
      const verdict = !surface
        ? 'UNVERIFIABLE'
        : surface === current || specsOnly
          ? 'current'
          : 'STALE';
      rows.push({
        target: target.id,
        capturedAt: commit.slice(0, 12),
        'measured surface': surface ? surface.slice(0, 12) : '(unreachable)',
        'engine commits since': commitsSince ? commitsSince(commit) : undefined,
        verdict: specsOnly ? 'current (specs only)' : verdict,
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
    } catch (error) {
      // A nonzero git exit means the path did not exist at that commit — a
      // real difference in the measured surface, not an unreadable one (the
      // commit itself was already proven reachable below). A spawn failure
      // (no git, bad cwd) has no exit status and must not read as 'absent':
      // two wholesale-failing reads compare equal and report the matrix
      // current (issue 1296).
      if (error?.status == null) throw error;
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

function changedFileReader(base) {
  return (commit) => {
    try {
      return execFileSync(
        'git',
        ['diff', '--name-only', `${commit}`, base, '--', ...MEASURED_SURFACE],
        { cwd: ROOT, encoding: 'utf8' }
      )
        .split('\n')
        .filter(Boolean);
    } catch {
      // Unreadable is not "nothing changed": returning an empty list here would
      // make `everyChangeIsASpec` false and leave the STALE verdict standing,
      // which is the safe direction.
      return [];
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

// The HEAD default is fold-time semantics and stays: gen-performance-matrix
// chains this check in-process, asking whether the captures match the tree the
// matrix is being folded from. But run from a branch carrying its own commits,
// "current" then means current against THIS branch — not against the branch
// point the published matrix describes — and nothing said so. The warning
// names that ambiguity without changing the verdict or the exit code. Silent
// when origin/main cannot be resolved: there is no branch point to diverge
// from, and a warning about an unanswerable comparison helps nobody.
export function implicitBaseWarning({ explicitBase, headSha, mergeBaseSha }) {
  if (explicitBase || !headSha || !mergeBaseSha || headSha === mergeBaseSha) return null;
  return (
    'WARN  --base defaulted to HEAD, and HEAD carries commits origin/main lacks — a ' +
    '"current" verdict means current against this branch, not against the published branch ' +
    'point. Pass --base=origin/main to check the captures against it, or --base=HEAD to ' +
    'compare against this branch deliberately.'
  );
}

// Null is "this ref cannot be resolved" — a repo with no origin/main has no
// branch point to warn about, so the caller stays silent. Broken code must
// not read the same way, hence rethrowIfBroken.
function gitLine(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim() || null;
  } catch (error) {
    rethrowIfBroken(error);
    return null;
  }
}

// The verdict-to-exit policy, kept pure so the default and --strict outcomes are
// testable without a git repository or a process exit. Neither mode reports an
// UNVERIFIABLE commit as current; only --strict turns it, or a STALE row, into
// a failure.
export function stalenessOutcome({ rows, resolvedBase, strict }) {
  const unverifiable = rows.filter((row) => row.verdict === 'UNVERIFIABLE');
  const stale = rows.filter((row) => row.verdict === 'STALE');
  const list = (subset) => subset.map((row) => `${row.target} (${row.capturedAt})`).join(', ');
  const lines = [];
  if (unverifiable.length) {
    lines.push(
      `WARN  ${unverifiable.length} capture commit(s) are not reachable from ${resolvedBase}: ` +
        `${list(unverifiable)}. A shallow clone is the usual cause — this needs the referenced ` +
        'commits fetched. Not reported as "current".'
    );
  }
  if (stale.length) {
    lines.push(
      `${stale.length} target(s) publish a capture taken from a product surface that has since ` +
        `changed: ${list(stale)}. Expected between campaigns — the next campaign recaptures ` +
        'them, or marks those modes preserved.'
    );
  } else if (!unverifiable.length) {
    lines.push(`${rows.length} captured cell group(s), all from the current product surface.`);
  }
  const failed = strict && (unverifiable.length > 0 || stale.length > 0);
  if (failed) {
    lines.push(
      '--strict asserts that every captured row is current. Recapture the rows above, or mark ' +
        'them preserved, before asserting it.'
    );
  }
  return { stale, unverifiable, lines, failed };
}

export async function checkMatrixStaleness({
  manifestPath = argFlag('manifest', DEFAULT_MANIFEST),
  base = argFlag('base'),
  strict = process.argv.includes('--strict'),
} = {}) {
  const explicitBase = base !== undefined;
  const resolvedBase = base ?? 'HEAD';
  console.log(`Comparing captured surfaces against --base=${resolvedBase}`);
  const warning = implicitBaseWarning({
    explicitBase,
    headSha: gitLine(['rev-parse', 'HEAD']),
    mergeBaseSha: gitLine(['merge-base', 'HEAD', 'origin/main']),
  });
  if (warning) console.warn(warning);
  const manifest = JSON.parse(readFileSync(`${ROOT}/${manifestPath}`, 'utf8'));
  const rows = assessManifest(manifest, {
    surfaceAt: gitSurfaceReader(resolvedBase),
    commitsSince: engineCommitCounter(resolvedBase),
    changedFilesSince: changedFileReader(resolvedBase),
  });
  if (!rows.length) {
    console.log('No current captured cells in the manifest — every target is preserved evidence.');
    return { rows, stale: [] };
  }
  console.table(rows);

  const outcome = stalenessOutcome({ rows, resolvedBase, strict });
  if (outcome.failed) fail(`\n${outcome.lines.join('\n')}`);
  console.log(`\n${outcome.lines.join('\n')}`);
  return { rows, stale: outcome.stale };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await checkMatrixStaleness();
  });
}
