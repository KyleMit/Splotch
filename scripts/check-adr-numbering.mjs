#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, argFlag, isMain, runMain } from './lib/proc.mjs';
import {
  ADR_DIR,
  adrNumber,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
  headingMismatches,
  malformedRecordNames,
  nextAdrNumber,
} from './lib/adr-numbering.mjs';

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
function annotate(kind, file, message) {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log(`::${kind} file=${ADR_DIR}/${file},line=1::${message}`);
}

function warn(message) {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
}

export function checkAdrNumbering() {
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
  const problems = formatProblems({ duplicates, collisions, mismatches, baseRef });

  if (problems.length === 0) {
    const records = head.filter((entry) => adrNumber(entry) !== null).length;
    console.log(`ADR numbering OK — ${records} records, every number unique.`);
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

  const free = nextAdrNumber([...head, ...(base ?? [])]);
  console.error('ADR numbering check failed:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    `\nAn ADR number identifies one record permanently. Give the later-landed record ` +
      `of each pair a free number — ${free} is the next one — and update its H1 heading, ` +
      `its row in ${ADR_DIR}/README.md, and every ADR-NNNN reference pointing at it.`
  );
  process.exit(1);
}

if (isMain(import.meta.url)) runMain(async () => checkAdrNumbering());
