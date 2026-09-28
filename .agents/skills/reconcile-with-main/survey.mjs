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
// Prints the relation verdict (unrelated / adjacent / coupled, with reasons),
// then four sections: the incoming commits; the upstream renames and
// deletions most likely to strand a call site; the files both sides changed
// (where a clean textual merge is least likely to mean a coherent result); and
// the upstream-only files. It never merges, never writes, and never moves a
// ref — the agent does that afterwards.
//
// The base is fixed at origin/main, matching the skill that runs it: every
// other step names main too, so a per-invocation base would survey one range
// and merge another.

import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
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

// How far the full semantic pass is warranted. "unrelated": nothing the
// branch changed shares a file with upstream, imports an upstream-changed
// module, or is governed by a changed repo-wide convention; a trial merge plus
// the type check and the branch's tests is enough. "adjacent": the branch
// imports a module upstream changed; the type check catches a renamed or
// reshaped export, and the listed upstream diffs are read for the contract
// changes types cannot see (a default, a return meaning). "coupled": shared
// files, a stranded rename, or a convention change; run the whole skill.
export const RELATIONS = ['unrelated', 'adjacent', 'coupled'];

// Repo-wide sources whose change can make untouched branch code wrong or
// non-compliant without a single shared file.
const CONVENTION_SOURCES = [
  /^eslint\.config\.js$/,
  /^(web\/)?tsconfig[^/]*\.json$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^web\/(svelte|vite)\.config\.[jt]s$/,
  /^\.ruler\/conventions\.md$/,
  /^docs\/CODING-STANDARDS\.md$/,
  /^(\.stylelintrc[^/]*|\.prettierrc[^/]*|dprint\.json)$/,
];

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
const REEXPORT_SPECIFIER =
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g;
const GLOB_CALL = /\bimport\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|(['"])[^'"\n]+\2)/g;
const QUOTED = /(['"])([^'"\n]+)\1/g;
const QUERY_SUFFIX = /[?#].*$/;
const MODULE_SUFFIX = /(\.svelte)?\.(m?[jt]s|svelte)$/;

const quotedStrings = (text) => [...text.matchAll(QUOTED)].map((match) => match[2]);

// A `?raw` or `?url` suffix names the same file; Vite strips it to resolve.
export const importSpecifiers = (source) =>
  [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[2].replace(QUERY_SUFFIX, ''));

export const reexportSpecifiers = (source) =>
  [...source.matchAll(REEXPORT_SPECIFIER)].map((match) => match[2].replace(QUERY_SUFFIX, ''));

// Negated patterns are dropped, so a glob matches a superset of what Vite
// loads: a false "depends" costs a read, a false "unrelated" costs a pass.
export const globPatterns = (source) =>
  [...source.matchAll(GLOB_CALL)]
    .flatMap((match) => quotedStrings(match[1]))
    .filter((pattern) => !pattern.startsWith('!'));

// Resolves the specifiers that can name a repo file; bare package names and
// other aliases return null and are covered by the package.json convention
// source instead. Vite reads a leading `/` from the web project root.
export function resolveSpecifier(specifier, importerPath) {
  if (specifier.startsWith('$lib/')) return `web/src/lib/${specifier.slice('$lib/'.length)}`;
  if (specifier.startsWith('/')) return posix.normalize(`web${specifier}`);
  if (specifier.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(importerPath), specifier));
  }
  return null;
}

export function globToRegExp(resolvedPattern) {
  let body = '';
  for (let i = 0; i < resolvedPattern.length; i += 1) {
    const char = resolvedPattern[i];
    if (char === '*' && resolvedPattern[i + 1] === '*') {
      const slash = resolvedPattern[i + 2] === '/';
      body += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (char === '*') body += '[^/]*';
    else if (char === '?') body += '[^/]';
    else if (char === '{') body += '(?:';
    else if (char === '}') body += ')';
    else if (char === ',') body += '|';
    else body += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${body}$`);
}

// Extension and `/index` are dropped so `./foo`, `./foo.ts`, and `./foo/index.ts`
// all name one module. `foo.svelte` and `foo.svelte.ts` share a key on purpose:
// `./foo.svelte` can name either, so a match on the key reads as a match on both.
export const moduleKey = (path) => path.replace(MODULE_SUFFIX, '').replace(/\/index$/, '');

const strandedBy = (entry) => MOVED_OR_DELETED_STATUS.test(entry.status);

// Upstream changes indexed by module key, keeping every entry that shares a key
// so a deletion is never hidden behind an edit of its namesake. A barrel that
// re-exports a changed module (transitively) joins the index, since importing
// the barrel imports the changed code.
function changedModules(upstream, reexporters) {
  const index = new Map();
  const add = (key, hit) => index.set(key, [...(index.get(key) ?? []), hit]);
  for (const entry of upstream) {
    for (const path of changedPaths(entry)) add(moduleKey(path), { entry, via: null });
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const { path, specifiers } of reexporters) {
      const key = moduleKey(path);
      if (index.has(key)) continue;
      const target = specifiers
        .map((specifier) => resolveSpecifier(specifier, path))
        .find((resolved) => resolved && index.has(moduleKey(resolved)));
      if (!target) continue;
      for (const hit of index.get(moduleKey(target))) add(key, { entry: hit.entry, via: path });
      grew = true;
    }
  }
  return index;
}

const describeHit = (importer, { entry, via }) => {
  const change = strandedBy(entry) ? 'moved or deleted' : 'changed';
  const route = via ? `${via}, which re-exports ${entry.from}` : entry.from;
  return `${importer} imports ${route}, which upstream ${change}`;
};

export function relate({ upstream, bothSides, localSources, reexporters = [] }) {
  const reasons = [];
  if (bothSides.length > 0) {
    reasons.push({ relation: 'coupled', why: `${bothSides.length} file(s) changed on both sides` });
  }
  for (const entry of upstream) {
    const convention = changedPaths(entry).find((path) =>
      CONVENTION_SOURCES.some((pattern) => pattern.test(path))
    );
    if (convention) reasons.push({ relation: 'coupled', why: `convention source ${convention}` });
  }

  const modules = changedModules(upstream, reexporters);
  const upstreamPaths = upstream.flatMap((entry) =>
    changedPaths(entry).map((path) => ({ path, entry }))
  );
  for (const { path, source } of localSources) {
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveSpecifier(specifier, path);
      for (const hit of (resolved && modules.get(moduleKey(resolved))) || []) {
        reasons.push({
          relation: strandedBy(hit.entry) ? 'coupled' : 'adjacent',
          why: describeHit(path, hit),
        });
      }
    }
    for (const pattern of globPatterns(source)) {
      const resolved = resolveSpecifier(pattern, path);
      if (!resolved) continue;
      const matcher = globToRegExp(resolved);
      for (const { path: changed, entry } of upstreamPaths.filter((item) =>
        matcher.test(item.path)
      )) {
        reasons.push({
          relation: strandedBy(entry) ? 'coupled' : 'adjacent',
          why: `${path} globs ${pattern}, which matches ${changed}, changed upstream`,
        });
      }
    }
  }

  const rank = Math.max(0, ...reasons.map((reason) => RELATIONS.indexOf(reason.relation)));
  return { relation: RELATIONS[rank], reasons };
}

// A single-line `export … from` and the closing line of a multi-line block;
// POSIX ERE, so no `\s`.
const REEXPORT_LINE_PATTERNS = ['export[^;]*from', '^[[:space:]]*}[[:space:]]*from'];
const CAT_FILE_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// Reads every `ref:path` blob through one `git cat-file --batch` process, since
// the candidate list runs to hundreds of files.
function readManyAt(ref, paths) {
  if (paths.length === 0) return [];
  const out = execFileSync('git', ['cat-file', '--batch'], {
    input: `${paths.map((path) => `${ref}:${path}`).join('\n')}\n`,
    maxBuffer: CAT_FILE_MAX_BUFFER_BYTES,
  });
  const sources = [];
  let offset = 0;
  for (const path of paths) {
    const headerEnd = out.indexOf(0x0a, offset);
    const [, type, size] = out.subarray(offset, headerEnd).toString('utf8').split(' ');
    offset = headerEnd + 1;
    if (type !== 'blob') continue;
    sources.push({ path, source: out.subarray(offset, offset + Number(size)).toString('utf8') });
    offset += Number(size) + 1;
  }
  return sources;
}

// Every file on the merge target that re-exports another module, so a barrel
// between the branch and a changed module still links them.
function reexportersOn(ref) {
  const patterns = REEXPORT_LINE_PATTERNS.flatMap((pattern) => ['-e', pattern]);
  let listed = [];
  try {
    listed = lines(
      git('grep', '-l', '-E', ...patterns, ref, '--', 'web/src', 'tools', 'netlify')
    ).map((line) => line.slice(ref.length + 1));
  } catch {
    // git grep exits 1 when nothing matches.
  }
  return readManyAt(ref, listed)
    .map(({ path, source }) => ({ path, specifiers: reexportSpecifiers(source) }))
    .filter((file) => file.specifiers.length > 0);
}

function readAtHead(path) {
  try {
    return git('show', `HEAD:${path}`);
  } catch {
    return null;
  }
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
  const upstream = changes(mergeBase, BASE_REF);
  const local = changes(mergeBase, 'HEAD');
  const classified = classifyChanges(upstream, local);
  const localSources = local
    .filter((entry) => !entry.status.startsWith('D'))
    .map((entry) => ({ path: entry.to, source: readAtHead(entry.to) }))
    .filter((file) => file.source !== null);

  return {
    branch,
    base: BASE_REF,
    mergeBase,
    dirtyWorkingTree,
    localCommits: Number(git('rev-list', '--count', `${mergeBase}..HEAD`)),
    incoming,
    ...classified,
    ...relate({
      upstream,
      bothSides: classified.bothSides,
      localSources,
      reexporters: incoming.length > 0 ? reexportersOn(BASE_REF) : [],
    }),
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

  section(`Relation: ${result.relation}`);
  if (result.reasons.length === 0) {
    console.log('  no shared file, no imported upstream change, no convention change');
  }
  for (const reason of result.reasons.slice(0, FILE_LIST_LIMIT)) {
    console.log(`  [${reason.relation}] ${reason.why}`);
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
