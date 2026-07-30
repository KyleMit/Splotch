#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, argFlag, isMain, runMain } from './lib/proc.mjs';
import {
  ADR_DIR,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
  nextAdrNumber,
} from './lib/adr-numbering.mjs';

const DEFAULT_BASE_REF = 'origin/main';

function baseEntries(baseRef) {
  try {
    const listing = execFileSync('git', ['ls-tree', '--name-only', `${baseRef}:${ADR_DIR}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return listing.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Workflow-command annotations, which GitHub reads off stdout and renders inline
 * on the offending file in the pull request diff. Emitted as raw strings rather
 * than through @actions/core so this script keeps its only-node-builtins
 * dependency profile, which is what lets its workflow skip installing anything.
 */
function annotate({ duplicates, collisions }) {
  if (!process.env.GITHUB_ACTIONS) return;
  for (const { number, files } of duplicates) {
    for (const file of files) {
      const others = files.filter((other) => other !== file).join(', ');
      console.log(
        `::error file=${ADR_DIR}/${file},line=1::ADR number ${number} is also held by ${others}`
      );
    }
  }
  for (const { number, baseFile, headFile } of collisions) {
    console.log(
      `::error file=${ADR_DIR}/${headFile},line=1::ADR number ${number} is already held by ${baseFile} on the base branch`
    );
  }
}

export function checkAdrNumbering() {
  const baseRef = argFlag('base', DEFAULT_BASE_REF);
  const head = readdirSync(join(ROOT, ADR_DIR));
  const base = baseEntries(baseRef);

  if (base === null) {
    console.warn(
      `Could not read ${baseRef}:${ADR_DIR} — checking the working tree only. ` +
        `Fetch the base ref to also catch a number this branch takes from it.`
    );
  }

  const duplicates = duplicateNumbers(head);
  const collisions = base === null ? [] : collisionsAgainstBase(base, head);
  const problems = formatProblems({ duplicates, collisions, baseRef });

  if (problems.length === 0) {
    console.log(`ADR numbering OK — every record in ${ADR_DIR} holds a unique number.`);
    return;
  }

  annotate({ duplicates, collisions });

  const free = nextAdrNumber([...head, ...(base ?? [])]);
  console.error('ADR numbering check failed:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    `\nAn ADR number identifies one record permanently. Renumber the record this ` +
      `branch adds to ${free}, then update its H1 heading, its row in ` +
      `${ADR_DIR}/README.md, and every ADR-NNNN reference pointing at it.`
  );
  process.exit(1);
}

if (isMain(import.meta.url)) runMain(async () => checkAdrNumbering());
