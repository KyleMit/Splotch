#!/usr/bin/env node
// Capture the pre-merge facts the reconcile-with-main skill reasons over —
// before the merge destroys the range that produces them. Once origin/main is
// an ancestor of HEAD, `<merge-base>..origin/main` is empty and the incoming
// commits are no longer separable from the branch's own history, so the
// "what actually landed upstream" question can only be answered cheaply on
// this side of the merge.
//
// Usage:
//   node .claude/skills/reconcile-with-main/survey.mjs [--no-fetch] [--json]
//
// Prints four sections: the incoming commits; the upstream renames and
// deletions most likely to strand a call site; the files both sides changed
// (where a clean textual merge is least likely to mean a coherent result); and
// the upstream-only files. It never merges, never writes, and never moves a
// ref — the agent does that afterwards.
//
// The base is fixed at origin/main, matching the skill that runs it: every
// other step names main too, so a per-invocation base would survey one range
// and merge another.

import { execFileSync } from 'node:child_process';
import { isMain } from '../../../tools/lib/proc.mjs';

const FILE_LIST_LIMIT = 40;
const BASE_REF = 'origin/main';

// R (rename) and C (copy) are the two statuses git reports with a second path
// column; every other status describes a single path.
const TWO_PATH_STATUS = /^[RC]/;
const MOVED_OR_DELETED_STATUS = /^[RD]/;

const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
const lines = (out) => (out ? out.split('\n') : []);

export function parseNameStatus(output) {
  return lines(output).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, from: paths[0], to: paths[1] ?? paths[0] };
  });
}

// A rename gives one logical file two names, and git merges across that split
// silently — it follows the rename and lands the branch's edits in the new
// path. Keying the overlap on the new name alone therefore misses the branch
// that edited the old one, which is exactly the case most in need of a read.
// So an entry contributes *both* of its names to the identity set, and a match
// on either one counts.
export const changedPaths = (entry) =>
  TWO_PATH_STATUS.test(entry.status) ? [entry.from, entry.to] : [entry.to];

const describeEntry = (entry) =>
  TWO_PATH_STATUS.test(entry.status) && entry.from !== entry.to
    ? { path: entry.to, previousPath: entry.from }
    : { path: entry.to };

const byPath = (a, b) => a.path.localeCompare(b.path);

export function classifyChanges(upstream, local) {
  const upstreamPaths = new Set(upstream.flatMap(changedPaths));
  const localPaths = new Set(local.flatMap(changedPaths));
  const touches = (entry, paths) => changedPaths(entry).some((path) => paths.has(path));

  return {
    movedOrDeleted: upstream.filter((entry) => MOVED_OR_DELETED_STATUS.test(entry.status)),
    bothSides: upstream
      .filter((entry) => touches(entry, localPaths))
      .map(describeEntry)
      .sort(byPath),
    upstreamOnly: upstream
      .filter((entry) => !touches(entry, localPaths))
      .map(describeEntry)
      .sort(byPath),
    localOnly: local
      .filter((entry) => !touches(entry, upstreamPaths))
      .map(describeEntry)
      .sort(byPath),
  };
}

function survey({ doFetch }) {
  if (doFetch) {
    process.stderr.write(`Fetching ${BASE_REF}…\n`);
    git('fetch', 'origin', 'main');
  }

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirtyWorkingTree = lines(git('status', '--porcelain'));
  const mergeBase = git('merge-base', 'HEAD', BASE_REF);

  const incoming = lines(
    git('log', '--format=%H%x09%an%x09%ad%x09%s', '--date=short', `${mergeBase}..${BASE_REF}`)
  ).map((line) => {
    const [sha, author, date, subject] = line.split('\t');
    return { sha, short: sha.slice(0, 12), author, date, subject };
  });

  const changes = (from, to) =>
    parseNameStatus(git('diff', '--name-status', '--find-renames', from, to));

  return {
    branch,
    base: BASE_REF,
    mergeBase,
    dirtyWorkingTree,
    localCommits: Number(git('rev-list', '--count', `${mergeBase}..HEAD`)),
    incoming,
    ...classifyChanges(changes(mergeBase, BASE_REF), changes(mergeBase, 'HEAD')),
  };
}

const formatEntry = (entry) =>
  entry.previousPath ? `${entry.path}  (renamed from ${entry.previousPath})` : entry.path;

function report(result) {
  const section = (title) => console.log(`\n${title}\n${'─'.repeat(title.length)}`);

  const printEntries = (entries) => {
    if (entries.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const entry of entries.slice(0, FILE_LIST_LIMIT)) console.log(`  ${formatEntry(entry)}`);
    if (entries.length > FILE_LIST_LIMIT) {
      console.log(`  … and ${entries.length - FILE_LIST_LIMIT} more`);
    }
  };

  console.log(`Branch ${result.branch} vs ${result.base}`);
  console.log(`Merge base ${result.mergeBase.slice(0, 12)}`);
  console.log(
    `${result.localCommits} local commit(s), ${result.incoming.length} incoming commit(s)`
  );
  if (result.dirtyWorkingTree.length > 0) {
    console.log(
      `\n⚠ ${result.dirtyWorkingTree.length} uncommitted change(s) — commit or stash before merging.`
    );
  }

  if (result.incoming.length === 0) {
    console.log(`\nAlready up to date with ${result.base}. Nothing to reconcile.`);
    return;
  }

  section('Incoming commits (oldest last)');
  for (const commit of result.incoming) {
    console.log(`  ${commit.short}  ${commit.date}  ${commit.author}  ${commit.subject}`);
  }

  section('Upstream renames & deletions — most likely to strand a call site');
  if (result.movedOrDeleted.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of result.movedOrDeleted.slice(0, FILE_LIST_LIMIT)) {
      console.log(
        entry.status.startsWith('R')
          ? `  ${entry.status}  ${entry.from} → ${entry.to}`
          : `  ${entry.status}   ${entry.from}`
      );
    }
    if (result.movedOrDeleted.length > FILE_LIST_LIMIT) {
      console.log(`  … and ${result.movedOrDeleted.length - FILE_LIST_LIMIT} more`);
    }
  }

  section(`Changed on BOTH sides (${result.bothSides.length}) — read these merged`);
  printEntries(result.bothSides);

  section(`Changed upstream only (${result.upstreamOnly.length}) — check what depends on them`);
  printEntries(result.upstreamOnly);
}

const KNOWN_FLAGS = new Set(['--no-fetch', '--json']);

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  // Rejected rather than ignored so an invocation carrying a base flag fails
  // instead of quietly surveying main and reporting on it as if asked.
  const unknown = args.filter((arg) => !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(' ')}`);
    console.error('Usage: survey.mjs [--no-fetch] [--json]   (the base is always origin/main)');
    process.exit(2);
  }
  const result = survey({ doFetch: !args.includes('--no-fetch') });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else report(result);
}
