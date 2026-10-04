// Render and drain the burndown's per-commit PR comments.
//
//   node tools/audit-burndown/backfill-comments.mjs capture [range]
//   node tools/audit-burndown/backfill-comments.mjs show
//   node tools/audit-burndown/backfill-comments.mjs next
//   node tools/audit-burndown/backfill-comments.mjs done <sha>
//
// The driver appends one record per fix to the store and never posts anything —
// it has no GitHub credential. Posting is the supervising agent's
// job, through the GitHub MCP tools, driven by the `next` → post → `done` loop.
//
// `capture` rebuilds records for fixes whose comments were never recorded,
// reading the same facts the driver had: run.log for the iteration→sha mapping,
// the role envelopes for the implementer's summary and the reviewer's catches,
// and the commit's own deletion from the run's backlog for the finding text.
// COMMENT_STORE and AUDIT_FILE select the store and that backlog, as they do
// for the driver.

import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../lib/proc.mjs';
import { parseSavedAgentOutput } from './lib/agent-runner.mjs';
import { commentStorePath } from './lib/burndown-config.mjs';
import {
  auditFile,
  chdirRoot,
  commandFailureOutput,
  ensureWorkDirs,
  git,
  gitOut,
  LOGS,
  logLine,
  WORK,
} from './lib/burndown-core.mjs';
import { commitCommentBody, findingProblem } from './lib/comment-sync.mjs';

// Every sha `done` has dropped, so `capture` can tell "never recorded" from
// "already posted". Without it `capture` deduped against the store alone — and
// the store is empty precisely when the drain succeeded, so the natural
// closeout instinct ("did I miss any?") silently re-armed every comment that
// had just been posted. Observed on the 2026-07-25 run: a post-drain capture
// re-added all 9.
//
// Deliberately not beside a committed COMMENT_STORE: it is a within-run guard,
// and a container that dies loses it, after which capture re-offers the posted
// records. That is the safe direction — the drain loop is at-least-once by
// design, and a duplicate comment beats a lost one.
const POSTED = join(WORK, 'posted-comments.log');

const readPosted = () =>
  new Set(existsSync(POSTED) ? readFileSync(POSTED, 'utf8').split('\n').filter(Boolean) : []);

const readStore = (store) =>
  existsSync(store)
    ? readFileSync(store, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

const storeLine = (record) => `${JSON.stringify(record)}\n`;

// A last record that lost its newline (a hand edit) still parses, but an append
// would join the next record onto its line, so that record is ended first.
function appendRecord(store, record) {
  const unterminated = existsSync(store) && /[^\n]$/.test(readFileSync(store, 'utf8'));
  appendFileSync(store, `${unterminated ? '\n' : ''}${storeLine(record)}`);
}

const structured = (file) => {
  if (!existsSync(file)) return null;
  const parsed = parseSavedAgentOutput(readFileSync(file, 'utf8'));
  return Object.keys(parsed.structured ?? {}).length ? parsed.structured : null;
};

// run.log interleaves `iterNNNN  (N remaining)  <title>` with a later
// `  DONE  <sha12>`, which is the only place the iteration number and the
// committed sha are tied together.
function completedIterations() {
  const log = join(LOGS, 'run.log');
  if (!existsSync(log)) return [];
  const out = [];
  let current = null;
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    const start = /^\[[\d:]+\] (iter\d+)\s+\(\d+ remaining\)\s+(.*)$/.exec(line);
    if (start) {
      current = { iter: start[1], title: start[2].trim() };
      continue;
    }
    const done = /^\[[\d:]+\]\s+DONE\s+([0-9a-f]{7,40})/.exec(line);
    if (done && current) {
      out.push({ ...current, shaShort: done[1] });
      current = null;
    }
  }
  return out;
}

// The fix commit deletes the finding from the backlog, so the finding text is
// exactly the removed lines of that commit's diff for the file. Plumbing rather
// than `git show`, whose output follows the host's colour and format settings.
function findingFromCommit(sha, backlog) {
  const diff = gitOut('diff-tree', '-p', '--no-commit-id', sha, '--', backlog);
  const removed = diff
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1));
  return removed.join('\n').trim();
}

function recordFor({ iter, title }, sha, backlog) {
  // Iteration log names restart at iter0001 every run, so a shorter run leaves
  // the previous run's iter0002.fix1.json sitting next to this run's
  // iter0002.impl.json. Every file an iteration writes lands after its own
  // verify (the first step), so verify's mtime dates the iteration and anything
  // older is a leftover from an earlier run about an unrelated finding.
  const stamp = (name) => {
    const file = join(LOGS, `${name}.json`);
    return existsSync(file) ? statSync(file).mtimeMs : 0;
  };
  const iterationStart = stamp(`${iter}.verify`);
  const ofThisRun = (name) => stamp(name) >= iterationStart;

  // A fix round supersedes the original implementer summary.
  let fix = '';
  for (const name of [`${iter}.impl`, `${iter}.fix1`, `${iter}.fix2`]) {
    if (!ofThisRun(name)) continue;
    const s = structured(join(LOGS, `${name}.json`));
    if (s?.summary) fix = s.summary;
  }

  // Only a round that demanded changes is an adversarial catch; the approving
  // round's findings are just its reasoning, which the driver does not include.
  const catches = [];
  for (const round of [1, 2, 3]) {
    if (!ofThisRun(`${iter}.review${round}`)) break;
    const s = structured(join(LOGS, `${iter}.review${round}.json`));
    if (!s) break;
    if (s.status !== 'APPROVED') catches.push(...(s.findings ?? []));
  }

  const verify = structured(join(LOGS, `${iter}.verify.json`));
  return {
    sha,
    title,
    problem: findingProblem(findingFromCommit(sha, backlog)),
    fix,
    catches,
    e2eSpecs: verify?.e2e_specs ?? [],
  };
}

// Scoped to a commit range so a run.log carrying earlier runs (whose comments
// were already posted to a since-merged PR) cannot re-capture them. A range git
// cannot resolve fails here instead of reading as empty: "0 captured" is also
// what a fully drained run prints, so a typo, or the default range in a
// checkout with no local main, would report success having checked nothing.
function capture(range, store, backlog) {
  const listed = git('rev-list', '--end-of-options', range, '--');
  if (listed.status !== 0) {
    console.error(
      `capture: cannot resolve range ${range} (${commandFailureOutput(listed)}) — ` +
        'pass one git can resolve, such as origin/main..HEAD or <base-sha>..HEAD'
    );
    return 1;
  }
  const inRange = new Set(listed.stdout.split('\n').filter(Boolean));
  const records = readStore(store);
  const known = new Set(records.map((r) => r.sha));
  const posted = readPosted();
  const skipped = new Set();
  let added = 0;

  for (const it of completedIterations()) {
    const sha = gitOut('rev-parse', it.shaShort);
    if (!inRange.has(sha) || known.has(sha)) continue;
    if (posted.has(sha)) {
      skipped.add(sha);
      continue;
    }
    // Appended, never rewritten: the driver appends to the same store at every
    // close-out, and a rewrite would drop any record it added meanwhile.
    appendRecord(store, recordFor(it, sha, backlog));
    known.add(sha);
    added += 1;
    console.log(`captured ${sha.slice(0, 12)}  ${it.title}`);
  }

  // Say what was skipped rather than staying silent about it: "0 captured" on a
  // run whose comments all landed reads like the tool failed.
  if (skipped.size) console.log(`skipped ${skipped.size} already posted`);
  console.log(`\n${added} captured, ${records.length + added} total in ${store}`);
  return 0;
}

// One record at a time, because the thing that posts it is an agent calling
// the GitHub MCP tools, not this script — there is no credential here. The
// agent renders one, posts it, then calls `done <sha>`; that ordering makes
// the loop at-least-once (a crash between the two re-offers the same record)
// rather than at-most-once, which is the right way round for a comment.
function next(store) {
  const [record] = readStore(store);
  if (!record) {
    console.log(`nothing pending in ${store}`);
    return 0;
  }
  console.log(`SHA ${record.sha}`);
  console.log('---8<--- body below ---8<---');
  console.log(commitCommentBody(record));
  return 0;
}

function done(prefix, store) {
  if (!prefix) {
    console.error('usage: backfill-comments.mjs done <sha>');
    return 1;
  }
  const records = readStore(store);
  const matches = records.filter((r) => r.sha.startsWith(prefix));
  // A capture racing the driver's close-out can leave two records for one
  // commit. They are one comment, so the post that answers one answers both.
  const shas = new Set(matches.map((r) => r.sha));
  if (shas.size === 0) {
    console.error(`no pending record matching ${prefix}`);
    return 1;
  }
  if (shas.size > 1) {
    console.error(
      `ambiguous prefix ${prefix} matches ${matches.length} pending records — use more characters`
    );
    return 1;
  }
  const [sha] = shas;
  const remaining = records.filter((r) => r.sha !== sha);
  writeFileSync(store, remaining.map(storeLine).join(''));
  // A committed store can be drained from a fresh checkout, which has no
  // .audit-work/ until something creates it.
  ensureWorkDirs();
  appendFileSync(POSTED, `${sha}\n`);
  logLine(`  posted per-commit comment for ${sha.slice(0, 12)}`);
  console.log(`dropped ${sha.slice(0, 12)} — ${remaining.length} still pending in ${store}`);
  return 0;
}

function show(store) {
  const records = readStore(store);
  console.log(`${records.length} pending comment(s) in ${store}\n`);
  for (const record of records) console.log(`${commitCommentBody(record)}\n\n---\n`);
  return 0;
}

// Runs one mode in the working directory and returns its exit code; `env`
// supplies COMMENT_STORE and AUDIT_FILE.
export function runBackfill(argv, env) {
  const [mode, arg] = argv;
  const store = commentStorePath(env);
  if (mode === 'capture') return capture(arg ?? 'main..HEAD', store, auditFile(env));
  if (mode === 'next') return next(store);
  if (mode === 'done') return done(arg, store);
  if (mode === 'show') return show(store);
  console.error('usage: backfill-comments.mjs capture [range] | show | next | done <sha>');
  return 1;
}

if (isMain(import.meta.url)) {
  chdirRoot();
  process.exitCode = runBackfill(process.argv.slice(2), process.env);
}
