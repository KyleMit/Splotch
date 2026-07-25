// Render and drain the burndown's per-commit PR comments.
//
//   node scripts/audit-burndown/backfill-comments.mjs capture [range]
//   node scripts/audit-burndown/backfill-comments.mjs show
//   node scripts/audit-burndown/backfill-comments.mjs next
//   node scripts/audit-burndown/backfill-comments.mjs done <sha>
//
// The driver appends one record per fix to the store and never posts anything —
// it has no GitHub credential. Posting is the supervising agent's
// job, through the GitHub MCP tools, driven by the `next` → post → `done` loop.
//
// `capture` rebuilds records for fixes whose comments were never recorded,
// reading the same facts the driver had: run.log for the iteration→sha mapping,
// the role envelopes for the implementer's summary and the reviewer's catches,
// and the commit's own docs/AUDIT.md deletion for the finding text.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chdirRoot, gitOut, LOGS, logLine, WORK } from './lib.mjs';
import { commitCommentBody, findingProblem } from './comment.mjs';

chdirRoot();

const STORE = process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');

const readStore = () =>
  existsSync(STORE)
    ? readFileSync(STORE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

const writeStore = (records) =>
  writeFileSync(
    STORE,
    records.length ? `${records.map((r) => JSON.stringify(r)).join('\n')}\n` : ''
  );

const structured = (file) => {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')).structured_output ?? null;
  } catch {
    return null;
  }
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

// The fix commit deletes the finding from docs/AUDIT.md, so the finding text is
// exactly the removed lines of that commit's diff for the file.
function findingFromCommit(sha) {
  const diff = gitOut('show', sha, '--', 'docs/AUDIT.md');
  const removed = diff
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1));
  return removed.join('\n').trim();
}

function recordFor({ iter, title, shaShort }) {
  const sha = gitOut('rev-parse', shaShort);
  if (!sha) return null;

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
    problem: findingProblem(findingFromCommit(sha)),
    fix,
    catches,
    e2eSpecs: verify?.e2e_specs ?? [],
  };
}

const [mode, rangeArg] = process.argv.slice(2);

if (mode === 'capture') {
  const range = rangeArg ?? 'main..HEAD';
  // Scope to a commit range so a run.log carrying earlier runs (whose comments
  // were already posted to a since-merged PR) cannot re-capture them.
  const inRange = new Set(gitOut('rev-list', range).split('\n').filter(Boolean));
  const store = readStore();
  const known = new Set(store.map((r) => r.sha));
  let added = 0;

  for (const it of completedIterations()) {
    const sha = gitOut('rev-parse', it.shaShort);
    if (!sha || !inRange.has(sha) || known.has(sha)) continue;
    const record = recordFor(it);
    if (!record) continue;
    store.push(record);
    known.add(sha);
    added += 1;
    console.log(`captured ${sha.slice(0, 12)}  ${it.title}`);
  }

  writeStore(store);
  console.log(`\n${added} captured, ${store.length} total in ${STORE}`);
} else if (mode === 'next') {
  // One record at a time, because the thing that posts it is an agent calling
  // the GitHub MCP tools, not this script — there is no credential here. The
  // agent renders one, posts it, then calls `done <sha>`; that ordering makes
  // the loop at-least-once (a crash between the two re-offers the same record)
  // rather than at-most-once, which is the right way round for a comment.
  const [record] = readStore();
  if (!record) {
    console.log(`nothing pending in ${STORE}`);
    process.exit(0);
  }
  console.log(`SHA ${record.sha}`);
  console.log('---8<--- body below ---8<---');
  console.log(commitCommentBody(record));
} else if (mode === 'done') {
  const sha = rangeArg;
  if (!sha) {
    console.error('usage: backfill-comments.mjs done <sha>');
    process.exit(1);
  }
  const store = readStore();
  const remaining = store.filter((r) => !r.sha.startsWith(sha));
  if (remaining.length === store.length) {
    console.error(`no pending record matching ${sha}`);
    process.exit(1);
  }
  writeStore(remaining);
  logLine(`  posted per-commit comment for ${sha.slice(0, 12)}`);
  console.log(`dropped ${sha.slice(0, 12)} — ${remaining.length} still pending in ${STORE}`);
} else if (mode === 'show') {
  const store = readStore();
  console.log(`${store.length} pending comment(s) in ${STORE}\n`);
  for (const record of store) console.log(`${commitCommentBody(record)}\n\n---\n`);
} else {
  console.error('usage: backfill-comments.mjs capture [range] | show | next | done <sha>');
  process.exit(1);
}
