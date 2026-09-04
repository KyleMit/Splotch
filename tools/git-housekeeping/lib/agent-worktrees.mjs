// Discovery of the agent-managed worktrees the prune and salvage scripts may
// touch. Only worktrees under an explicit root are candidates: the main
// checkout and any hand-made checkout elsewhere are never considered, whatever
// their state.

import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

import { currentWorktreeOf, git, listWorktrees } from './git-facts.mjs';
import { listProcessCwds, processesUsing } from './process-cwds.mjs';

// Gitignored paths worth moving out before a worktree is removed. Everything
// else ignored (node_modules, env copies, sync output, screenshots) is
// disposable. Prefixes are worktree-relative and end in `/` so a matching
// status line is a directory or something inside one.
export const SALVAGE_PREFIXES = [
  'perf-profiles/',
  'tools/redteam/decrypted/',
  'tools/redteam/output/',
  'web/tests/redteam/decrypted/',
  'web/tests/redteam/output/',
];

export const DEFAULT_EVIDENCE_DIR = join(homedir(), 'Code', 'splotch-worktree-evidence');

// Claude Code cuts worktrees under the main checkout's `.claude/worktrees/`
// and, for scratch checkouts, under `/tmp`; Codex uses `~/.codex/worktrees/`.
function defaultWorktreeRoots(mainCheckout) {
  return [
    join(mainCheckout, '.claude', 'worktrees'),
    join(homedir(), '.codex', 'worktrees'),
    '/tmp',
  ];
}

function realpathOrNull(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function rootContaining(realPath, realRoots) {
  return realRoots.find((root) => realPath.startsWith(`${root}/`)) ?? null;
}

export function discoverAgentWorktrees({ cwd, roots }) {
  const worktrees = listWorktrees(cwd);
  const mainCheckout = worktrees[0].path;
  const current = realpathOrNull(currentWorktreeOf(cwd));
  const realRoots = (roots ?? defaultWorktreeRoots(mainCheckout))
    .map(realpathOrNull)
    .filter(Boolean);
  const candidates = [];
  const excluded = [];
  for (const [index, worktree] of worktrees.entries()) {
    if (index === 0) {
      excluded.push({ ...worktree, reason: 'main checkout' });
      continue;
    }
    const real = worktree.prunable ? worktree.path : realpathOrNull(worktree.path);
    const root = real ? rootContaining(real, realRoots) : null;
    if (!root) {
      excluded.push({ ...worktree, reason: 'outside every root' });
      continue;
    }
    if (real === current) {
      excluded.push({ ...worktree, reason: 'current worktree' });
      continue;
    }
    candidates.push({ ...worktree, real, root, id: relative(root, real) });
  }
  return { mainCheckout, current, roots: realRoots, candidates, excluded };
}

// Why a worktree must not be touched right now, or null. Both passes ask this
// same question: the prune before removing a directory, the salvage before
// moving files out of one. A locked worktree or one some process is sitting in
// is a session mid-flight — moving a capture's output out from under it splits
// the run, and a cross-filesystem salvage deletes the source after copying.
export function worktreeHold(worktree, processCwds) {
  if (worktree.locked) return { outcome: 'skip (locked)', reason: worktree.locked };
  const users = processesUsing(worktree.real, processCwds);
  if (users.length > 0) {
    return {
      outcome: 'skip (in use)',
      reason: users
        .map(({ pid, command }) => (command ? `pid ${pid} ${command}` : `pid ${pid}`))
        .join(', '),
    };
  }
  return null;
}

// Re-ask the hold question for one worktree from scratch. Both halves have to
// come from the live system: a plan is minutes old by the time `--apply` runs,
// so a session can have started inside the worktree *and* a capture can have
// locked it since. Reusing the plan's `locked` value would answer the second
// half with a stale snapshot, which is the same class of mistake as trusting a
// branch name to still point where it did.
export function stillHeld(worktreePath, cwd = worktreePath) {
  const live = listWorktrees(cwd).find((worktree) => worktree.path === worktreePath);
  return worktreeHold({ ...(live ?? {}), real: worktreePath }, listProcessCwds());
}

// `git status --porcelain --ignored=matching` marks ignored entries with `!!`
// and lists each path that matches an ignore rule, with a trailing slash on a
// directory. The default `--ignored` mode instead collapses to the highest
// directory whose contents are all ignored, which hides `tools/redteam/output/`
// behind `tools/` in a checkout where nothing else under tools/ exists yet.
export function parseIgnoredPaths(porcelain) {
  return porcelain
    .split('\n')
    .filter((line) => line.startsWith('!! '))
    .map((line) => line.slice(3));
}

export function partitionIgnoredPaths(paths, prefixes = SALVAGE_PREFIXES) {
  const salvage = [];
  const disposable = [];
  for (const path of paths) {
    const matches = prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
    (matches ? salvage : disposable).push(path);
  }
  return { salvage, disposable };
}

export function listIgnoredPaths(worktreePath, pathspecs = []) {
  return parseIgnoredPaths(
    git(['status', '--porcelain', '--ignored=matching', '--', ...pathspecs], { cwd: worktreePath })
  );
}

// Only *ignored* content under the salvage prefixes is at risk: tracked
// evidence survives `git worktree remove` in the repository itself, so a
// worktree whose perf-profiles/ holds nothing but committed files is not held.
export function unsalvagedEvidence(worktreePath, prefixes = SALVAGE_PREFIXES) {
  const present = prefixes.filter((prefix) => existsSync(join(worktreePath, prefix)));
  if (present.length === 0) return [];
  return partitionIgnoredPaths(listIgnoredPaths(worktreePath, present), prefixes).salvage;
}
