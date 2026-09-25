// Report how old each performance-matrix section's evidence is, oldest first;
// fail only under --strict, and then only on incomplete provenance.
//
//   npm run check:matrix-staleness
//   npm run check:matrix-staleness -- --manifest=<sources.json> --base=origin/main
//   npm run check:matrix-staleness -- --strict
//
// The matrix is refreshed by periodic campaigns while `main` takes several
// product merges a day, so a section is almost never captured at the tip. What a
// reader needs is how old the evidence is and how much has landed since, not a
// current-or-stale verdict that is false for most of every section's life
// (ADR-0175, superseding ADR-0159). Each captured section — drawing, undo, and
// actions, preserved ones included — is reported with its `capturedOn` date, its
// age in days, its product commit, and the commits that landed on top of it.
//
// `--strict` asserts provenance-complete: every captured section carries a valid
// `capturedOn` date and a product commit this checkout can resolve. A section
// that cannot say when or from what it was captured cannot be aged, so that is
// the claim a campaign's regenerate makes and the one worth failing on.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';
import { MATRIX_SECTIONS, captureAgeDays, isCaptureDate, utcDate } from './lib/capture-date.mjs';
import { CAPTURED_UNTRACKED, PRESERVED } from './gen-performance-matrix.mjs';

const DEFAULT_MANIFEST = 'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json';
const DISPLAY_COMMIT_CHARS = 12;

// The product surface a capture actually measures. An enumerated *directory* scope
// was tried first and missed by the margin an enumeration always does: gating on
// `web/src/lib/drawing` missed a commit that changed DrawingCanvas.svelte and
// drawing-audio scheduling. Widening to `web/src` alone then missed the next one —
// 105c23bd..a347da5e has an identical `web/src` tree and changes three pencil
// sound assets, which a drawing capture plays.
//
// So the surface spans source, the static assets served with it, and the build
// inputs that decide what the bundle contains. `web/tests` is excluded because a
// spec cannot affect the product. `package.json` is excluded in favour of
// `pnpm-lock.yaml`: the lockfile moves when dependencies do, while package.json
// also moves for every script added.
export const MEASURED_SURFACE = [
  'web/src',
  'web/static',
  'web/svelte.config.js',
  'web/vite.config.ts',
  'pnpm-lock.yaml',
];

// `web/tests` is excluded above on the principle that a spec cannot affect the
// product, but this repo colocates unit tests beside their source, so a consumer
// that must ignore spec-only drift filters these names out of the surface.
export const SPEC_FILE = /\.(test|spec)\.[^.]+$/;

// Counted separately from the measured surface because the drawing engine is the
// narrow path most drawing sections are read for.
const ENGINE_SURFACE = ['web/src/lib/drawing'];

const unique = (values) => [...new Set(values.filter(Boolean))];

function evidenceState(declared) {
  return declared === PRESERVED || declared === CAPTURED_UNTRACKED ? declared : 'captured';
}

const PUBLISHED_COMMITS = {
  drawing: (published) =>
    Object.values(published?.drawing ?? {}).flatMap((entry) =>
      (entry?.runs ?? []).map((run) => run.productCommit)
    ),
  undo: (published) => [published?.undo?.productCommit],
  actions: (published) => (published?.actions?.sources ?? []).map((source) => source.productCommit),
};

// The manifest's own commit field for a section, which is what a freshly
// captured section is measured at and what a captured-untracked one is pinned to.
function manifestCommits(name, mode) {
  if (name === 'drawing') return [mode.drawingProductCommit];
  if (name === 'undo') return [mode.undoProductCommit ?? mode.drawingProductCommit];
  if (mode.actionSources === CAPTURED_UNTRACKED) {
    return [mode.actionProductCommit ?? mode.drawingProductCommit];
  }
  return (Array.isArray(mode.actionSources) ? mode.actionSources : []).map(
    (source) => source?.productCommit
  );
}

// A preserved section has no commit of its own in the manifest; a
// captured-untracked one falls back to its pin when no published report says.
function sectionCommits(state, pinned, published) {
  if (state === 'captured') return pinned;
  if (published.length) return published;
  return state === CAPTURED_UNTRACKED ? pinned : [];
}

// Every section a captured mode publishes, with the commits it was captured at.
// The generator copies both a preserved and a captured-untracked section from
// the report the manifest names (`preservedEvidence.from`), so their commits are
// read from there: the commit the page shows is the one that gets aged. A
// captured-untracked section also carries a manifest pin, and a pin that
// disagrees with the published section is a provenance conflict, not a choice.
// An action section is checked whenever one is declared — the generator
// publishes it even beside an actionsUnavailableReason.
export function sectionProvenance(mode, publishedMode) {
  if (mode.status !== 'captured') return [];
  const declared = { drawing: mode.drawing, undo: mode.undoSource, actions: mode.actionSources };
  return MATRIX_SECTIONS.filter((name) => name === 'drawing' || declared[name] !== undefined).map(
    (name) => {
      const state = evidenceState(declared[name]);
      const pinned = unique(manifestCommits(name, mode));
      const published = unique(PUBLISHED_COMMITS[name](publishedMode));
      const conflict =
        state === CAPTURED_UNTRACKED &&
        published.length > 0 &&
        pinned.some((commit) => !published.includes(commit));
      return {
        section: name,
        state,
        capturedOn: mode.capturedOn?.[name],
        commits: sectionCommits(state, pinned, published),
        ...(conflict ? { pinned } : {}),
      };
    }
  );
}

function provenanceProblems({ capturedOn, commits, pinned }, isReachable) {
  const problems = [];
  if (pinned) {
    problems.push(
      `manifest pins ${pinned.map((sha) => sha.slice(0, DISPLAY_COMMIT_CHARS)).join(', ')} but the published section carries ${commits.map((sha) => sha.slice(0, DISPLAY_COMMIT_CHARS)).join(', ')}`
    );
  }
  if (capturedOn === undefined) problems.push('no capturedOn date');
  else if (!isCaptureDate(capturedOn)) problems.push(`capturedOn ${capturedOn} is not YYYY-MM-DD`);
  if (!commits.length) problems.push('no product commit');
  for (const commit of commits) {
    if (!isReachable(commit))
      problems.push(`commit ${commit.slice(0, DISPLAY_COMMIT_CHARS)} is unreachable`);
  }
  return problems;
}

export function assessManifest(manifest, { publishedModeFor, today, isReachable }) {
  const sections = [];
  for (const target of manifest.targets ?? []) {
    for (const mode of target.modes ?? []) {
      for (const entry of sectionProvenance(mode, publishedModeFor(target.id, mode.id))) {
        sections.push({
          target: target.id,
          mode: mode.id,
          ...entry,
          ageDays: captureAgeDays(entry.capturedOn, today),
          problems: provenanceProblems(entry, isReachable),
        });
      }
    }
  }
  return sections;
}

// One row per target section that shares a date, a commit, and an evidence state,
// oldest first; an undated section sorts ahead of every dated one, since its age
// is the thing nobody can read.
export function ageReportRows(sections, { commitsSince }) {
  const groups = new Map();
  for (const entry of sections) {
    const key = [
      entry.target,
      entry.section,
      entry.capturedOn,
      entry.commits.join(','),
      entry.state,
    ].join('|');
    const group = groups.get(key) ?? { ...entry, modes: [] };
    group.modes.push(entry.mode);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity))
    .map((group) => {
      const [commit] = group.commits;
      return {
        target: group.target,
        section: group.section,
        modes: group.modes.join(', '),
        evidence: group.state,
        capturedOn: group.capturedOn ?? '(undated)',
        'age (days)': group.ageDays ?? '?',
        capturedAt:
          group.commits.map((sha) => sha.slice(0, DISPLAY_COMMIT_CHARS)).join(', ') || '(none)',
        'engine commits since': commit ? commitsSince(commit, ENGINE_SURFACE) : undefined,
        'product commits since': commit ? commitsSince(commit, MEASURED_SURFACE) : undefined,
      };
    });
}

// The verdict-to-exit policy, kept pure so the default and --strict outcomes are
// testable without a git repository or a process exit.
export function provenanceOutcome({ sections, strict }) {
  const incomplete = sections.filter((entry) => entry.problems.length);
  const lines = [];
  if (incomplete.length) {
    const groups = new Map();
    for (const entry of incomplete) {
      const problems = entry.problems.join('; ');
      const key = `${entry.target}|${entry.section}|${problems}`;
      const group = groups.get(key) ?? { ...entry, problems, modes: [] };
      group.modes.push(entry.mode);
      groups.set(key, group);
    }
    const list = [...groups.values()]
      .map(
        (group) =>
          `${group.target}/${group.section} [${group.modes.join(', ')}] (${group.problems})`
      )
      .join(', ');
    lines.push(
      `${strict ? 'FAIL' : 'WARN'}  ${incomplete.length} captured section(s) lack complete provenance: ${list}. ` +
        'A shallow clone is the usual cause of an unreachable commit; a missing date needs capturedOn in the manifest.'
    );
  }
  const dated = sections.filter((entry) => entry.ageDays !== null);
  if (dated.length) {
    const oldest = dated.reduce((a, b) => (b.ageDays > a.ageDays ? b : a));
    lines.push(
      `${sections.length} captured section(s); the oldest, ${oldest.target}/${oldest.mode}/${oldest.section}, ` +
        `was captured ${oldest.capturedOn} (${oldest.ageDays} days ago). Age is reported, never failed: ` +
        'an old red keeps counting until it is recaptured or explained (ADR-0175).'
    );
  }
  const failed = strict && incomplete.length > 0;
  if (failed) {
    lines.push(
      '--strict asserts provenance-complete: every captured section carries a capturedOn date and a ' +
        'reachable product commit. Date or commit the sections above before asserting it.'
    );
  }
  return { incomplete, lines, failed };
}

function commitCounter(base) {
  const counts = new Map();
  return (commit, pathspec) => {
    const key = `${commit}|${pathspec.join(' ')}`;
    if (!counts.has(key)) {
      counts.set(key, gitCount(['rev-list', '--count', `${commit}..${base}`, '--', ...pathspec]));
    }
    return counts.get(key);
  };
}

function gitCount(args) {
  const line = gitLine(args);
  return line === null ? undefined : Number(line);
}

function reachabilityReader() {
  const known = new Map();
  return (commit) => {
    if (!known.has(commit)) {
      known.set(
        commit,
        gitLine(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]) !== null
      );
    }
    return known.get(commit);
  };
}

// The HEAD default counts commits against the tree the matrix is being folded
// from. Run from a branch carrying its own commits, the counts then include this
// branch's work — not the drift since the published branch point — and nothing
// said so. The warning names that ambiguity. Silent when origin/main cannot be
// resolved: there is no branch point to diverge from.
export function implicitBaseWarning({ explicitBase, headSha, mergeBaseSha }) {
  if (explicitBase || !headSha || !mergeBaseSha || headSha === mergeBaseSha) return null;
  return (
    'WARN  --base defaulted to HEAD, and HEAD carries commits origin/main lacks — the commits-since ' +
    'counts include this branch. Pass --base=origin/main to count against the published branch ' +
    'point, or --base=HEAD to count against this branch deliberately.'
  );
}

// Null is "this ref cannot be resolved" — an unreachable commit or a repo with no
// origin/main. Broken code must not read the same way, hence rethrowIfBroken.
function gitLine(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim() || null;
  } catch (error) {
    rethrowIfBroken(error);
    return null;
  }
}

// A preserved section is carried from the report the manifest names, so its
// commits are read from there. A manifest with no such report has no preserved
// section to read, and any it declares reports as missing a commit.
function publishedModeReader(manifest, manifestFullPath) {
  const from = manifest.preservedEvidence?.from;
  const path = from && (isAbsolute(from) ? from : resolve(dirname(manifestFullPath), from));
  const published = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  const byTarget = new Map(
    (published?.targets ?? []).map((target) => [
      target.id,
      new Map((target.modes ?? []).map((mode) => [mode.id, mode])),
    ])
  );
  return (targetId, modeId) => byTarget.get(targetId)?.get(modeId) ?? null;
}

export async function checkMatrixStaleness({
  manifestPath = argFlag('manifest', DEFAULT_MANIFEST),
  base = argFlag('base'),
  strict = process.argv.includes('--strict'),
  today = utcDate(Date.now()),
} = {}) {
  const explicitBase = base !== undefined;
  const resolvedBase = base ?? 'HEAD';
  console.log(`Section ages as of ${today}; commits counted against --base=${resolvedBase}`);
  const warning = implicitBaseWarning({
    explicitBase,
    headSha: gitLine(['rev-parse', 'HEAD']),
    mergeBaseSha: gitLine(['merge-base', 'HEAD', 'origin/main']),
  });
  if (warning) console.warn(warning);
  const manifestFullPath = isAbsolute(manifestPath) ? manifestPath : join(ROOT, manifestPath);
  const manifest = JSON.parse(readFileSync(manifestFullPath, 'utf8'));
  const sections = assessManifest(manifest, {
    publishedModeFor: publishedModeReader(manifest, manifestFullPath),
    today,
    isReachable: reachabilityReader(),
  });
  if (!sections.length) {
    console.log('No captured sections in the manifest.');
    return { sections, incomplete: [] };
  }
  console.table(ageReportRows(sections, { commitsSince: commitCounter(resolvedBase) }));

  const outcome = provenanceOutcome({ sections, strict });
  if (outcome.failed) fail(`\n${outcome.lines.join('\n')}`);
  console.log(`\n${outcome.lines.join('\n')}`);
  return { sections, incomplete: outcome.incomplete };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await checkMatrixStaleness();
  });
}
