#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
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

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
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

function listAdrEntries(root, args) {
  return git(root, [...args, '--', ADR_DIR]).map((path) => path.slice(`${ADR_DIR}/`.length));
}

// Additions count whether committed, staged, or untracked, so a collision fails
// before the commit that would carry it. The diff runs from the base tree to the
// working tree: -M reports a retitle as a rename rather than an addition, and it
// is two-dot because the workflow's --depth=1 base fetch leaves no merge base for
// a three-dot range. Diff never lists an untracked file, so ls-files supplies
// those, less any taking the number of a base record that HEAD holds and the
// working tree deleted: a retitle by plain mv, which diff cannot see as one.
function addedRecords(root, baseRef, base) {
  try {
    const tracked = listAdrEntries(root, ['diff', '-M', '--diff-filter=A', '--name-only', baseRef]);
    const untracked = listAdrEntries(root, ['ls-files', '--others', '--exclude-standard']);
    const deleted = listAdrEntries(root, [
      'diff',
      '--no-renames',
      '--diff-filter=D',
      '--name-only',
      'HEAD',
    ]);
    const retitledNumbers = new Set(deleted.filter((file) => base.includes(file)).map(adrNumber));
    return [...tracked, ...untracked.filter((file) => !retitledNumbers.has(adrNumber(file)))];
  } catch {
    return null;
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
  const added = base === null ? null : addedRecords(root, baseRef, base);
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
