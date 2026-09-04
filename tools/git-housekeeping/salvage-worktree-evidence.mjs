#!/usr/bin/env node
// Move gitignored evidence out of agent worktrees before they are removed.
// `git worktree remove` deletes ignored paths without asking, and raw
// performance captures and red-team output have been lost that way. Plans by
// default; `--apply` moves the allowlisted paths and reports what it left for
// the prune to delete.
//
// Usage:
//   node tools/git-housekeeping/salvage-worktree-evidence.mjs [--apply] [--root=<dir>]...
//                                                             [--dest=<dir>] [--json]

import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import {
  DEFAULT_EVIDENCE_DIR,
  discoverAgentWorktrees,
  listIgnoredPaths,
  partitionIgnoredPaths,
} from './lib/agent-worktrees.mjs';
import { formatOutcomeLine, formatSummary, outcomeWidth } from './lib/outcome-report.mjs';

const DISPOSABLE_PREVIEW_COUNT = 6;

export function parseSalvageArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      apply: { type: 'boolean', default: false },
      root: { type: 'string', multiple: true },
      dest: { type: 'string', default: DEFAULT_EVIDENCE_DIR },
      json: { type: 'boolean', default: false },
    },
  });
  return { apply: values.apply, roots: values.root ?? null, dest: values.dest, json: values.json };
}

export function planSalvage({ cwd, roots, dest, onProgress }) {
  const discovered = discoverAgentWorktrees({ cwd, roots });
  const rows = [];
  for (const [index, worktree] of discovered.candidates.entries()) {
    if (onProgress) onProgress(index + 1, discovered.candidates.length, worktree.id);
    if (worktree.prunable) continue;
    const { salvage, disposable } = partitionIgnoredPaths(listIgnoredPaths(worktree.real));
    for (const path of salvage) {
      const from = join(worktree.real, path);
      const to = join(dest, worktree.id, path);
      rows.push({
        worktree: worktree.real,
        id: worktree.id,
        path,
        from,
        to,
        outcome: existsSync(to) ? 'conflict' : 'salvage',
        reason: existsSync(to) ? `${to} already exists` : `→ ${to}`,
      });
    }
    if (disposable.length > 0) {
      const preview = disposable.slice(0, DISPOSABLE_PREVIEW_COUNT).join(', ');
      const more = disposable.length - DISPOSABLE_PREVIEW_COUNT;
      rows.push({
        worktree: worktree.real,
        id: worktree.id,
        path: null,
        disposable,
        outcome: 'leave',
        reason: `${preview}${more > 0 ? `, +${more} more` : ''}`,
      });
    }
  }
  return { ...discovered, dest, rows };
}

// rename() cannot cross filesystems (EXDEV), and an evidence directory on
// another volume is a legitimate destination, so fall back to copy-then-delete.
export function moveTree(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

function printReport(plan, { json }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(plan.rows, null, 2)}\n`);
    return;
  }
  const width = outcomeWidth(plan.rows);
  for (const row of plan.rows) {
    const subject = row.path ? `${row.id}/${row.path}` : row.id;
    process.stdout.write(`${formatOutcomeLine({ ...row, subject }, width)}\n`);
  }
  process.stdout.write(
    `\n${plan.candidates.length} agent worktrees under ${plan.roots.join(', ')}: ${formatSummary(plan.rows) || 'nothing ignored'}\n`
  );
}

export async function salvageWorktreeEvidence(options, { cwd = ROOT } = {}) {
  const { apply, roots, dest, json } = options;
  const note = (message) => process.stderr.write(`${message}\n`);
  const plan = planSalvage({
    cwd,
    roots,
    dest,
    onProgress: (done, total, id) => note(`listing ${done}/${total} ${id}…`),
  });
  if (apply) {
    for (const row of plan.rows) {
      if (row.outcome !== 'salvage') continue;
      try {
        moveTree(row.from, row.to);
        row.outcome = 'salvaged';
      } catch (err) {
        row.outcome = 'failed';
        row.reason = err.message;
      }
    }
  }
  printReport(plan, { json });
  if (!apply) note(`Dry run. Pass --apply to move the \`salvage\` rows under ${dest}.`);
  else if (plan.rows.some((row) => row.outcome === 'failed')) process.exitCode = 1;
  return plan;
}

if (isMain(import.meta.url)) {
  runMain(() =>
    salvageWorktreeEvidence(parseOrFail(() => parseSalvageArgs(process.argv.slice(2))))
  );
}
