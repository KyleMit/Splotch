#!/usr/bin/env node
// Capture the pre-merge facts the reconcile-with-main skill reasons over —
// before the merge destroys the range that produces them. Once origin/main is
// an ancestor of HEAD, `<merge-base>..origin/main` is empty and the incoming
// commits are no longer separable from the branch's own history, so the
// "what actually landed upstream" question can only be answered cheaply on
// this side of the merge.
//
// Usage:
//   node .claude/skills/reconcile-with-main/survey.mjs [--base main] [--no-fetch] [--json]
//
// Prints four sections: the incoming commits; the upstream renames and
// deletions most likely to strand a call site; the files both sides changed
// (where a clean textual merge is least likely to mean a coherent result); and
// the upstream-only files. It never merges, never writes, and never moves a
// ref — the agent does that afterwards.

import { execFileSync } from 'node:child_process';

const FILE_LIST_LIMIT = 40;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const doFetch = !args.includes('--no-fetch');
const baseIdx = args.indexOf('--base');
const base = baseIdx !== -1 ? args[baseIdx + 1] : 'main';
const baseRef = `origin/${base}`;

const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
const lines = (out) => (out ? out.split('\n') : []);

if (doFetch) {
  process.stderr.write(`Fetching ${baseRef}…\n`);
  git('fetch', 'origin', base);
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const dirty = lines(git('status', '--porcelain'));
const mergeBase = git('merge-base', 'HEAD', baseRef);

const incoming = lines(
  git('log', '--format=%H%x09%an%x09%ad%x09%s', '--date=short', `${mergeBase}..${baseRef}`)
).map((line) => {
  const [sha, author, date, subject] = line.split('\t');
  return { sha, short: sha.slice(0, 12), author, date, subject };
});

const localCommits = Number(git('rev-list', '--count', `${mergeBase}..HEAD`));

// --find-renames so a moved module reports as R (with its new path) rather than
// as an unrelated delete plus add; a call site that survived the merge is
// broken the same way by either, but the R rows say what to point it at.
const upstreamStatus = lines(
  git('diff', '--name-status', '--find-renames', mergeBase, baseRef)
).map((line) => {
  const [status, ...paths] = line.split('\t');
  return { status, from: paths[0], to: paths[1] ?? paths[0] };
});

const movedOrDeleted = upstreamStatus.filter((entry) => /^[RD]/.test(entry.status));

const upstreamFiles = new Set(upstreamStatus.map((entry) => entry.to));
const localFiles = new Set(lines(git('diff', '--name-only', mergeBase, 'HEAD')));

const bothSides = [...upstreamFiles].filter((file) => localFiles.has(file)).sort();
const upstreamOnly = [...upstreamFiles].filter((file) => !localFiles.has(file)).sort();

const survey = {
  branch,
  base: baseRef,
  mergeBase,
  dirtyWorkingTree: dirty,
  localCommits,
  incoming,
  movedOrDeleted,
  bothSides,
  upstreamOnly,
  localOnly: [...localFiles].filter((file) => !upstreamFiles.has(file)).sort(),
};

if (asJson) {
  console.log(JSON.stringify(survey, null, 2));
  process.exit(0);
}

const section = (title) => console.log(`\n${title}\n${'─'.repeat(title.length)}`);

const printFiles = (files) => {
  if (files.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const file of files.slice(0, FILE_LIST_LIMIT)) console.log(`  ${file}`);
  if (files.length > FILE_LIST_LIMIT) {
    console.log(`  … and ${files.length - FILE_LIST_LIMIT} more`);
  }
};

console.log(`Branch ${branch} vs ${baseRef}`);
console.log(`Merge base ${mergeBase.slice(0, 12)}`);
console.log(`${localCommits} local commit(s), ${incoming.length} incoming commit(s)`);
if (dirty.length > 0) {
  console.log(`\n⚠ ${dirty.length} uncommitted change(s) — commit or stash before merging.`);
}

if (incoming.length === 0) {
  console.log(`\nAlready up to date with ${baseRef}. Nothing to reconcile.`);
  process.exit(0);
}

section('Incoming commits (oldest last)');
for (const commit of incoming) {
  console.log(`  ${commit.short}  ${commit.date}  ${commit.author}  ${commit.subject}`);
}

section('Upstream renames & deletions — most likely to strand a call site');
if (movedOrDeleted.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of movedOrDeleted.slice(0, FILE_LIST_LIMIT)) {
    console.log(
      entry.status.startsWith('R')
        ? `  ${entry.status}  ${entry.from} → ${entry.to}`
        : `  ${entry.status}   ${entry.from}`
    );
  }
  if (movedOrDeleted.length > FILE_LIST_LIMIT) {
    console.log(`  … and ${movedOrDeleted.length - FILE_LIST_LIMIT} more`);
  }
}

section(`Changed on BOTH sides (${bothSides.length}) — read these merged`);
printFiles(bothSides);

section(`Changed upstream only (${upstreamOnly.length}) — check what depends on them`);
printFiles(upstreamOnly);
