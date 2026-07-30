#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  ADR_DIR,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
} from './lib/adr-numbering.mjs';

const DEFAULT_BASE_REF = 'origin/main';

function parseArgs(argv) {
  const baseFlag = argv.indexOf('--base');
  return {
    baseRef: baseFlag === -1 ? DEFAULT_BASE_REF : argv[baseFlag + 1],
  };
}

function workingTreeEntries() {
  return readdirSync(join(process.cwd(), ADR_DIR));
}

function baseEntries(baseRef) {
  try {
    const listing = execFileSync('git', ['ls-tree', '--name-only', `${baseRef}:${ADR_DIR}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return listing.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

const { baseRef } = parseArgs(process.argv.slice(2));
const head = workingTreeEntries();
const base = baseEntries(baseRef);

if (base === null) {
  console.warn(
    `Could not read ${baseRef}:${ADR_DIR} — checking the working tree only. ` +
      `Fetch the base ref to also catch a number this branch takes from it.`
  );
}

const problems = formatProblems({
  duplicates: duplicateNumbers(head),
  collisions: base === null ? [] : collisionsAgainstBase(base, head),
  baseRef,
});

if (problems.length > 0) {
  console.error(`ADR numbering check failed:\n`);
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    `\nADR numbers identify a record permanently. Renumber the record this ` +
      `branch adds to one past the highest in ${ADR_DIR}, and update its H1 ` +
      `heading, its row in ${ADR_DIR}/README.md, and any ADR-NNNN references to it.`
  );
  process.exit(1);
}

console.log(`ADR numbering OK — every record in ${ADR_DIR} holds a unique number.`);
