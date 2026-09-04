#!/usr/bin/env node
// Remove agent worktrees that are clean, merged into the base, hold no
// unsalvaged evidence, and are nobody's working directory. Plans by default;
// `--apply` removes. Never touches the main checkout, the current worktree, a
// worktree outside every root, or any branch.
//
// Usage:
//   node tools/git-housekeeping/prune-agent-worktrees.mjs [--apply] [--root=<dir>]...
//                                                         [--no-fetch] [--json] [--base=origin/main]

import { parseArgs } from 'node:util';

import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import { discoverAgentWorktrees, unsalvagedEvidence } from './lib/agent-worktrees.mjs';
import { fetchBase, git, isAncestor, tryGit } from './lib/git-facts.mjs';
import { formatOutcomeLine, formatSummary, outcomeWidth } from './lib/outcome-report.mjs';
import { listProcessCwds, processesUsing } from './lib/process-cwds.mjs';

export const DEFAULT_BASE = 'origin/main';

export function parsePruneWorktreesArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      apply: { type: 'boolean', default: false },
      root: { type: 'string', multiple: true },
      'no-fetch': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      base: { type: 'string', default: DEFAULT_BASE },
    },
  });
  return {
    apply: values.apply,
    roots: values.root ?? null,
    fetch: !values['no-fetch'],
    json: values.json,
    base: values.base,
  };
}

function describeProcess({ pid, command }) {
  return command ? `pid ${pid} ${command}` : `pid ${pid}`;
}

export function classifyWorktree(worktree, { base, processCwds, cwd }) {
  if (worktree.prunable) {
    return { outcome: 'prunable', reason: `${worktree.prunable} — git worktree prune` };
  }
  if (worktree.locked) {
    return { outcome: 'skip (locked)', reason: worktree.locked };
  }
  const users = processesUsing(worktree.real, processCwds);
  if (users.length > 0) {
    return { outcome: 'skip (in use)', reason: users.map(describeProcess).join(', ') };
  }
  const evidence = unsalvagedEvidence(worktree.real);
  if (evidence.length > 0) {
    return {
      outcome: 'keep',
      reason: `unsalvaged evidence: ${evidence.join(', ')} — run worktrees:salvage first`,
    };
  }
  const status = git(['status', '--porcelain'], { cwd: worktree.real });
  if (status.length > 0) {
    const count = status.split('\n').length;
    return {
      outcome: 'keep',
      reason: `uncommitted changes: ${count} path${count === 1 ? '' : 's'}`,
    };
  }
  if (!isAncestor(worktree.head, base, cwd)) {
    const ahead = git(['rev-list', '--count', `${base}..${worktree.head}`], { cwd });
    const label = worktree.branch ?? `detached ${worktree.head.slice(0, 12)}`;
    return {
      outcome: 'keep',
      reason: `unmerged: ${label} is ${ahead} commit${ahead === '1' ? '' : 's'} ahead of ${base}`,
    };
  }
  const label = worktree.branch ? `${worktree.branch} merged` : `detached at a merged commit`;
  return { outcome: 'remove', reason: `clean, ${label} into ${base}` };
}

export function planWorktreePrune({ cwd, roots, base, processCwds, onProgress }) {
  const discovered = discoverAgentWorktrees({ cwd, roots });
  const rows = discovered.candidates.map((worktree, index) => {
    if (onProgress) onProgress(index + 1, discovered.candidates.length, worktree.id);
    return { ...worktree, ...classifyWorktree(worktree, { base, processCwds, cwd }) };
  });
  return { ...discovered, rows };
}

export function removeWorktree(row, { mainCheckout }) {
  const result = tryGit(['worktree', 'remove', row.real], { cwd: mainCheckout });
  if (result.ok) return { outcome: 'removed', reason: row.reason };
  return {
    outcome: 'kept',
    reason: `git worktree remove refused: ${result.stderr.split('\n')[0]}`,
  };
}

function printReport(plan, { json }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(plan.rows, null, 2)}\n`);
    return;
  }
  const width = outcomeWidth(plan.rows);
  for (const row of plan.rows) {
    process.stdout.write(`${formatOutcomeLine({ ...row, subject: row.real }, width)}\n`);
  }
  const outside = plan.excluded.filter((worktree) => worktree.reason === 'outside every root');
  process.stdout.write(
    `\n${plan.rows.length} agent worktrees under ${plan.roots.join(', ')}: ${formatSummary(plan.rows) || 'none'}` +
      `\n${outside.length} worktrees outside every root were not considered.\n`
  );
}

export async function pruneAgentWorktrees(options, { cwd = ROOT } = {}) {
  const { apply, roots, fetch, json, base } = options;
  const note = (message) => process.stderr.write(`${message}\n`);
  if (fetch) {
    const fetched = fetchBase(cwd, { prune: false });
    if (!fetched.ok) {
      note(
        `fetch failed (${fetched.stderr.split('\n')[0]}); judging against the last-known ${base}, which can only keep more`
      );
    }
  }
  const plan = planWorktreePrune({
    cwd,
    roots,
    base,
    processCwds: listProcessCwds(),
    onProgress: (done, total, id) => note(`checking ${done}/${total} ${id}…`),
  });
  if (apply) {
    for (const row of plan.rows) {
      if (row.outcome === 'remove') Object.assign(row, removeWorktree(row, plan));
      else if (row.outcome === 'keep') row.outcome = 'kept';
    }
    if (plan.rows.some((row) => row.outcome === 'prunable')) {
      const pruned = tryGit(['worktree', 'prune'], { cwd: plan.mainCheckout });
      for (const row of plan.rows) {
        if (row.outcome === 'prunable') row.outcome = pruned.ok ? 'pruned' : 'prunable';
      }
    }
  }
  printReport(plan, { json });
  if (!apply) note('Dry run. Pass --apply to remove the `remove` rows.');
  return plan;
}

if (isMain(import.meta.url)) {
  runMain(() =>
    pruneAgentWorktrees(parseOrFail(() => parsePruneWorktreesArgs(process.argv.slice(2))))
  );
}
