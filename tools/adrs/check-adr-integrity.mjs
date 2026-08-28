#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, argFlag, isMain, runMain } from '../lib/proc.mjs';
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

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter(Boolean);
}

function baseEntries(baseRef) {
  try {
    return git(['ls-tree', '--name-only', `${baseRef}:${ADR_DIR}`]);
  } catch {
    return null;
  }
}

// -M so a retitled record is reported as a rename, not an addition; --diff-filter=A
// then leaves only records this branch genuinely introduced. Two-dot because the
// workflow's --depth=1 base fetch leaves no merge base for a three-dot range.
function addedRecords(baseRef) {
  try {
    return git([
      'diff',
      '-M',
      '--diff-filter=A',
      '--name-only',
      baseRef,
      'HEAD',
      '--',
      ADR_DIR,
    ]).map((path) => path.slice(`${ADR_DIR}/`.length));
  } catch {
    return null;
  }
}

function firstLines(entries) {
  return entries
    .filter((entry) => adrNumber(entry) !== null)
    .map((file) => ({
      file,
      firstLine: readFileSync(join(ROOT, ADR_DIR, file), 'utf8').split('\n', 1)[0],
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

export function checkAdrIntegrity() {
  const baseRef = argFlag('base', DEFAULT_BASE_REF);
  const head = readdirSync(join(ROOT, ADR_DIR));
  const base = baseEntries(baseRef);
  const added = base === null ? null : addedRecords(baseRef);

  if (base === null || added === null) {
    warn(
      `Could not resolve ${baseRef} — checking the working tree only, so a number ` +
        `this branch takes from the base branch will not be caught. Fetch the base ref to restore it.`
    );
  }

  for (const name of malformedRecordNames(head)) {
    warn(
      `${ADR_DIR}/${name} starts with four digits but is not a valid record name ` +
        `(NNNN-lower-kebab-case.md), so it is invisible to this check.`
    );
  }

  const duplicates = duplicateNumbers(head);
  const collisions = added === null ? [] : collisionsAgainstBase(base, added);
  const mismatches = headingMismatches(firstLines(head));
  const index = indexIntegrity(head, readFileSync(join(ROOT, ADR_DIR, 'README.md'), 'utf8'));
  const problems = formatProblems({ duplicates, collisions, mismatches, index, baseRef });

  if (problems.length === 0) {
    const records = head.filter((entry) => adrNumber(entry) !== null).length;
    console.log(
      `ADR integrity OK — ${records} records, every number unique, every record indexed once, ` +
        `and every local ADR link valid.`
    );
    return;
  }

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

  console.error('ADR integrity check failed:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    `\nEvery ADR must have one unique number, a matching H1, and exactly one ` +
      `canonical entry in ${ADR_DIR}/README.md; every local ADR link must have a matching ` +
      `label and existing target.`
  );
  if (duplicates.length > 0 || collisions.length > 0) {
    const free = nextAdrNumber([...head, ...(base ?? [])]);
    console.error(
      `For a numbering collision, give the record with fewer inbound references a free number; ` +
        `if tied, renumber the later-landed record. ${free} is the next free number. Then update ` +
        `its H1, index entry, and every ADR-NNNN reference to it.`
    );
  }
  process.exit(1);
}

if (isMain(import.meta.url)) runMain(async () => checkAdrIntegrity());
