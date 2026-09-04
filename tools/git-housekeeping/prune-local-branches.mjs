#!/usr/bin/env node
// Delete local branches that are mechanically dead and report why every other
// one stays. Plans by default; `--apply` deletes. Two proofs of death:
//
//   merged      the tip is an ancestor of the base — `git branch -d` accepts it
//   equivalent  every commit's patch-id is on the base (rebase-merged), or the
//               PR's squash commit carries the branch's exact diff — `-d`
//               refuses these because ancestry says no, so they are deleted
//               with `-D` only behind `--include-equivalent`, proof printed
//
// Everything else is a judgment call for the prune-git-workspace skill.
//
// Usage:
//   node tools/git-housekeeping/prune-local-branches.mjs [--apply] [--include-equivalent]
//                                                        [--no-fetch] [--json] [--base=origin/main]

import { parseArgs } from 'node:util';

import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import {
  currentBranchOf,
  fetchBase,
  isAncestor,
  isPatchEquivalent,
  listBranchRefs,
  listWorktrees,
  squashMatches,
  tryGit,
} from './lib/git-facts.mjs';
import { fetchPullRequestIndex } from './lib/github-prs.mjs';
import { formatOutcomeLine, formatSummary, outcomeWidth } from './lib/outcome-report.mjs';

export const DEFAULT_BASE = 'origin/main';
const PROGRESS_EVERY = 100;

export function parsePruneBranchesArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      apply: { type: 'boolean', default: false },
      'include-equivalent': { type: 'boolean', default: false },
      'no-fetch': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      base: { type: 'string', default: DEFAULT_BASE },
    },
  });
  return {
    apply: values.apply,
    includeEquivalent: values['include-equivalent'],
    fetch: !values['no-fetch'],
    json: values.json,
    base: values.base,
  };
}

// The local branch the base tracks (`origin/main` → `main`) is never a candidate.
export function protectedBranchName(base) {
  return base.split('/').pop();
}

export function classifyLocalBranch(branch, ctx) {
  const { base, currentBranch, heldBy, prIndex, proofs } = ctx;
  const upstreamNote = branch.upstreamGone ? ', upstream gone' : '';
  if (branch.name === protectedBranchName(base)) {
    return { tier: 'skip', reason: 'protected base branch' };
  }
  if (branch.name === currentBranch) {
    return { tier: 'skip', reason: 'current checkout' };
  }
  const worktree = heldBy.get(branch.name);
  if (worktree) {
    return { tier: 'skip', reason: `in use: checked out in ${worktree}` };
  }
  const pr = prIndex.get(branch.name);
  if (pr?.state === 'OPEN') {
    return { tier: 'skip', reason: `PR #${pr.number} open` };
  }
  if (branch.ahead === 0 || proofs.isAncestor(branch.tip)) {
    return { tier: 'merged', reason: `merged into ${base}${upstreamNote}` };
  }
  if (proofs.isPatchEquivalent(branch.tip)) {
    const via = pr?.state === 'MERGED' ? `, PR #${pr.number} merged` : '';
    return {
      tier: 'equivalent',
      reason: `every commit has a patch-equivalent on ${base} (rebase-merged${via})`,
    };
  }
  if (pr?.state === 'MERGED') {
    if (proofs.squashMatches(branch.tip, pr.mergeCommit)) {
      return {
        tier: 'equivalent',
        reason: `squash-merged as PR #${pr.number} (branch diff matches ${pr.mergeCommit.slice(0, 12)})`,
      };
    }
    return {
      tier: 'keep',
      reason: `PR #${pr.number} merged but the branch carries changes its merge commit does not — judgment pass`,
    };
  }
  if (pr?.state === 'CLOSED') {
    return { tier: 'keep', reason: `PR #${pr.number} closed unmerged — judgment pass` };
  }
  const prNote = ctx.prLookupOk ? 'no PR' : 'PR state unknown';
  return {
    tier: 'keep',
    reason: `${branch.ahead} unique commit${branch.ahead === 1 ? '' : 's'}, ${prNote}${upstreamNote} — judgment pass`,
  };
}

export function planLocalBranchPrune({ cwd, base, prIndex, prLookupOk, onProgress }) {
  const currentBranch = currentBranchOf(cwd);
  const heldBy = new Map(
    listWorktrees(cwd)
      .filter((worktree) => worktree.branch)
      .map((worktree) => [worktree.branch, worktree.path])
  );
  const proofs = {
    isAncestor: (tip) => isAncestor(tip, base, cwd),
    isPatchEquivalent: (tip) => isPatchEquivalent(base, tip, cwd),
    squashMatches: (tip, mergeCommit) => squashMatches(base, tip, mergeCommit, cwd),
  };
  const ctx = { base, currentBranch, heldBy, prIndex, prLookupOk, proofs };
  const branches = listBranchRefs(cwd, { base, namespace: 'refs/heads' });
  return branches.map((branch, index) => {
    if (onProgress && index > 0 && index % PROGRESS_EVERY === 0) onProgress(index, branches.length);
    return { ...branch, ...classifyLocalBranch(branch, ctx) };
  });
}

function firstLine(text) {
  return text.split('\n')[0];
}

export function deleteLocalBranch(row, { cwd, base, includeEquivalent }) {
  if (row.tier === 'merged') {
    const safe = tryGit(['branch', '-d', row.name], { cwd });
    if (safe.ok) return { outcome: 'deleted', reason: row.reason };
    if (includeEquivalent) {
      const forced = tryGit(['branch', '-D', row.name], { cwd });
      if (forced.ok) {
        return {
          outcome: 'deleted',
          reason: `${row.reason}; -d refused because HEAD is behind ${base}, -D after proof`,
        };
      }
      return { outcome: 'kept', reason: `git branch -D refused: ${firstLine(forced.stderr)}` };
    }
    return {
      outcome: 'kept',
      reason: `git branch -d refused (${firstLine(safe.stderr)}); HEAD is behind ${base} — rerun from a current checkout or pass --include-equivalent`,
    };
  }
  if (row.tier === 'equivalent') {
    if (!includeEquivalent) {
      return {
        outcome: 'kept',
        reason: `${row.reason} — pass --include-equivalent to delete with -D`,
      };
    }
    const forced = tryGit(['branch', '-D', row.name], { cwd });
    if (forced.ok) return { outcome: 'deleted', reason: `${row.reason}; -D after proof` };
    return { outcome: 'kept', reason: `git branch -D refused: ${firstLine(forced.stderr)}` };
  }
  return null;
}

export function plannedOutcome(row, { includeEquivalent }) {
  if (row.tier === 'merged') return 'delete';
  if (row.tier === 'equivalent') return includeEquivalent ? 'delete -D' : 'proven';
  if (row.tier === 'skip') return row.reason.startsWith('in use') ? 'skip (in use)' : 'skip';
  return 'keep';
}

function printReport(rows, { json }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  const width = outcomeWidth(rows);
  for (const row of rows) {
    process.stdout.write(`${formatOutcomeLine({ ...row, subject: row.name }, width)}\n`);
  }
  process.stdout.write(`\n${rows.length} local branches: ${formatSummary(rows)}\n`);
}

export async function pruneLocalBranches(options, { cwd = ROOT } = {}) {
  const { apply, includeEquivalent, fetch, json, base } = options;
  const note = (message) => process.stderr.write(`${message}\n`);
  if (fetch) {
    const fetched = fetchBase(cwd);
    if (!fetched.ok) {
      note(
        `fetch failed (${firstLine(fetched.stderr)}); classifying against the last-known ${base}, which can only keep more`
      );
    }
  }
  const prs = fetchPullRequestIndex({ cwd });
  if (!prs.ok) {
    note(
      `PR lookup unavailable (${prs.error}): open PRs cannot be excluded and squash merges cannot be proven`
    );
  }
  const rows = planLocalBranchPrune({
    cwd,
    base,
    prIndex: prs.index,
    prLookupOk: prs.ok,
    onProgress: (done, total) => note(`classified ${done}/${total}…`),
  });
  const applying = apply && prs.ok;
  for (const row of rows) {
    const planned = plannedOutcome(row, { includeEquivalent });
    if (!applying) {
      row.outcome = planned;
      continue;
    }
    const applied = deleteLocalBranch(row, { cwd, base, includeEquivalent });
    row.outcome = applied ? applied.outcome : planned === 'keep' ? 'kept' : planned;
    if (applied) row.reason = applied.reason;
  }
  printReport(rows, { json });
  if (apply && !prs.ok) {
    note(
      'Refusing to delete without PR state: an open PR is in the never-delete set. Fix `gh auth status` and rerun.'
    );
    process.exitCode = 1;
  } else if (!apply) {
    note(
      'Dry run. Pass --apply to delete the `delete` rows; add --include-equivalent for the `proven` rows.'
    );
  }
  return rows;
}

if (isMain(import.meta.url)) {
  runMain(() =>
    pruneLocalBranches(parseOrFail(() => parsePruneBranchesArgs(process.argv.slice(2))))
  );
}
