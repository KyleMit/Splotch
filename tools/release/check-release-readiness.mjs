// Refuses a release cut whose parent commit is not the green tip of origin/main.
//
//   node tools/release/check-release-readiness.mjs              report and exit nonzero on any problem
//   node tools/release/check-release-readiness.mjs --rehearse   also dispatch the tag-only workflows against main and wait
//
// cut-release.mjs calls assertReleaseReady() before it touches a file, so a
// stale or red main is refused before the version bump, not after the tag.
// `--unverified` on cut-release.mjs is the reviewed escape hatch.

import { parseArgs } from 'node:util';
import { ROOT, capture, fail, isMain, parseOrFail, tryCapture } from '../lib/proc.mjs';
import { readinessProblems, renderReadiness, TAG_ONLY_GATES } from './lib/release-readiness.mjs';

const REPO = 'KyleMit/Splotch';
const CHECK_RUNS_PAGE_SIZE = 100;
// A dispatched tag-gate rehearsal is bounded by the slowest gate: the iOS
// simulator smoke took 12.4 minutes on the v1.6.0 tag.
const REHEARSAL_TIMEOUT_MINUTES = 25;

export function parseReadinessArgs(args) {
  const parsed = parseArgs({ args, options: { rehearse: { type: 'boolean' } } });
  return { rehearse: parsed.values.rehearse ?? false };
}

function gitState() {
  capture('git', ['fetch', '--quiet', 'origin', 'main']);
  return {
    head: capture('git', ['rev-parse', 'HEAD']).trim(),
    upstream: capture('git', ['rev-parse', 'origin/main']).trim(),
    branch: capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    dirtyPaths: capture('git', ['status', '--porcelain']).split(/\r?\n/).filter(Boolean),
  };
}

function fetchCheckRuns(sha) {
  const result = tryCapture('gh', [
    'api',
    `repos/${REPO}/commits/${sha}/check-runs?per_page=${CHECK_RUNS_PAGE_SIZE}`,
    '--jq',
    '.check_runs | map({name, status, conclusion})',
  ]);
  if (!result.ok) fail(`gh api check-runs failed:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

// workflow_dispatch runs against main are the only way to meet the tag-only
// gates before the tag exists. `gh run watch` blocks until each finishes.
function rehearseTagGates() {
  for (const gate of TAG_ONLY_GATES) {
    const args = ['workflow', 'run', gate.workflow, '--ref', 'main'];
    if (gate.workflow === 'test.yml') args.push('-f', 'gate=full');
    capture('gh', args, { cwd: ROOT });
  }
  console.log(
    `Dispatched ${TAG_ONLY_GATES.length} tag-gate workflows against main; waiting up to ${REHEARSAL_TIMEOUT_MINUTES} min…`
  );
  for (const gate of TAG_ONLY_GATES) {
    const id = capture('gh', [
      'run',
      'list',
      '--workflow',
      gate.workflow,
      '--event',
      'workflow_dispatch',
      '--limit',
      '1',
      '--json',
      'databaseId',
      '--jq',
      '.[0].databaseId',
    ]).trim();
    const watched = tryCapture('gh', ['run', 'watch', id, '--exit-status']);
    if (!watched.ok) fail(`${gate.name} failed on main (run ${id}) — fix before tagging`);
  }
}

export function assertReleaseReady({ rehearse = false } = {}) {
  const state = gitState();
  const checkRuns = fetchCheckRuns(state.head);
  const problems = readinessProblems({ ...state, checkRuns });
  console.log(renderReadiness({ head: state.head, problems, checkRuns, rehearsed: rehearse }));
  if (problems.length) {
    fail(
      '\nNot ready to release. Fix the problems above, or pass --unverified to cut-release.mjs after reviewing them.'
    );
  }
  if (rehearse) rehearseTagGates();
}

export function main(args = process.argv.slice(2)) {
  const { rehearse } = parseOrFail(() => parseReadinessArgs(args));
  assertReleaseReady({ rehearse });
}

if (isMain(import.meta.url)) main();
