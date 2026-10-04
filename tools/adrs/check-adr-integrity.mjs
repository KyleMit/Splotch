#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT, argFlag, isMain, rejectUnknownFlags, runMain } from '../lib/proc.mjs';
import {
  ADR_DIR,
  adrNumber,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
  headingMismatches,
  indexIntegrity,
  malformedRecordNames,
  nextAdrNumber,
} from './lib/adr-integrity.mjs';

const DEFAULT_BASE_REF = 'origin/main';

function git(root, args, env = process.env) {
  return execFileSync('git', args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter(Boolean);
}

function baseEntries(root, baseRef) {
  try {
    return git(root, ['ls-tree', '--name-only', `${baseRef}:${ADR_DIR}`]);
  } catch {
    return null;
  }
}

// Judged on the working tree alone, so a record counts the same committed,
// staged, or untracked. A scratch index of HEAD, with the working tree's new
// files under ADR_DIR added as intent-to-add entries, lets diff-index compare
// the base tree with the working tree itself, and -M pairs a retitle by content
// however it was made. The base is compared directly, not through a merge base,
// which the workflow's --depth=1 base fetch lacks. The scratch object directory
// borrows the repository's store as an alternate, so the check adds nothing to
// the repository's index or object store.
function addedRecords(root, baseRef) {
  const scratch = mkdtempSync(join(tmpdir(), 'adr-integrity-'));
  try {
    const [objects] = git(root, ['rev-parse', '--git-path', 'objects']);
    const env = {
      ...process.env,
      GIT_INDEX_FILE: join(scratch, 'index'),
      GIT_OBJECT_DIRECTORY: scratch,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: resolve(root, objects),
    };
    git(root, ['read-tree', 'HEAD'], env);
    git(root, ['add', '--intent-to-add', '--', ADR_DIR], env);
    const diffArgs = ['diff-index', '-M', '--diff-filter=A', '--name-only', baseRef, '--', ADR_DIR];
    return git(root, diffArgs, env).map((path) => path.slice(`${ADR_DIR}/`.length));
  } catch {
    return null;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function firstLines(root, entries) {
  return entries
    .filter((entry) => adrNumber(entry) !== null)
    .map((file) => ({
      file,
      firstLine: readFileSync(join(root, ADR_DIR, file), 'utf8').split('\n', 1)[0],
    }));
}

/**
 * Workflow-command annotations, which GitHub reads off stdout and renders inline
 * on the offending file in the pull request diff. Emitted as raw strings rather
 * than through @actions/core so this script keeps its only-node-builtins
 * dependency profile, which is what lets its workflow skip installing anything.
 */
function annotate(kind, file, message, line = 1) {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log(`::${kind} file=${ADR_DIR}/${file},line=${line}::${message}`);
}

function warn(message) {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
}

export function checkAdrIntegrity({ baseRef, root }) {
  const head = readdirSync(join(root, ADR_DIR));
  const base = baseEntries(root, baseRef);
  const added = base === null ? null : addedRecords(root, baseRef);
  const warnings = [];

  if (base === null || added === null) {
    warnings.push(
      `Could not resolve ${baseRef} — checking the working tree only, so a number ` +
        `this branch takes from the base branch will not be caught. Fetch the base ref to restore it.`
    );
  }

  for (const name of malformedRecordNames(head)) {
    warnings.push(
      `${ADR_DIR}/${name} starts with four digits but is not a valid record name ` +
        `(NNNN-lower-kebab-case.md), so it is invisible to this check.`
    );
  }

  const duplicates = duplicateNumbers(head);
  const collisions = added === null ? [] : collisionsAgainstBase(base, added);
  const mismatches = headingMismatches(firstLines(root, head));
  const index = indexIntegrity(head, readFileSync(join(root, ADR_DIR, 'README.md'), 'utf8'));
  return {
    warnings,
    recordCount: head.filter((entry) => adrNumber(entry) !== null).length,
    duplicates,
    collisions,
    mismatches,
    index,
    problems: formatProblems({ duplicates, collisions, mismatches, index, baseRef }),
    nextFreeNumber: nextAdrNumber([...head, ...(base ?? [])]),
  };
}

function annotateProblems({ duplicates, collisions, mismatches, index }) {
  for (const { number, files } of duplicates) {
    for (const file of files) {
      const others = files.filter((other) => other !== file).join(', ');
      annotate('error', file, `ADR number ${number} is also held by ${others}`);
    }
  }
  for (const { number, baseFile, headFile } of collisions) {
    annotate(
      'error',
      headFile,
      `ADR number ${number} is already held by ${baseFile} on the base branch`
    );
  }
  for (const { file, expected } of mismatches) {
    annotate('error', file, `Heading does not match the filename's number ${expected}`);
  }
  for (const file of index.missing) {
    annotate('error', file, 'ADR record has no entry in a canonical README.md position');
  }
  for (const { file, entries } of index.duplicates) {
    for (const { line } of entries) {
      annotate('error', 'README.md', `${file} is indexed more than once`, line);
    }
  }
  for (const { file, expected, line } of index.mismatches) {
    annotate(
      'error',
      'README.md',
      `Index link text does not match ${file}'s number ${expected}`,
      line
    );
  }
  for (const { file, line } of index.unknown) {
    annotate('error', 'README.md', `Index target ${file} is not an ADR record`, line);
  }
}

function printReport(result) {
  const { warnings, recordCount, problems, duplicates, collisions, nextFreeNumber } = result;
  for (const message of warnings) warn(message);

  if (problems.length === 0) {
    console.log(
      `ADR integrity OK — ${recordCount} records, every number unique, every record indexed once, ` +
        `and every local ADR link valid.`
    );
    return;
  }

  annotateProblems(result);
  console.error('ADR integrity check failed:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    `\nEvery ADR must have one unique number, a matching H1, and exactly one ` +
      `canonical entry in ${ADR_DIR}/README.md; every local ADR link must have a matching ` +
      `label and existing target.`
  );
  if (duplicates.length > 0 || collisions.length > 0) {
    console.error(
      `For a numbering collision, give the record with fewer inbound references a free number; ` +
        `if tied, renumber the later-landed record. ${nextFreeNumber} is the next free number. ` +
        `Then update its H1, index entry, and every ADR-NNNN reference to it.`
    );
  }
}

if (isMain(import.meta.url)) {
  rejectUnknownFlags(['base']);
  const baseRef = argFlag('base', DEFAULT_BASE_REF);
  runMain(async () => {
    const result = checkAdrIntegrity({ baseRef, root: ROOT });
    printReport(result);
    if (result.problems.length > 0) process.exit(1);
  });
}
