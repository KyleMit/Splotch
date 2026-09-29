// Discovery of the agent-managed worktrees the prune and salvage scripts may
// touch. Only worktrees under an explicit root are candidates: the main
// checkout and any hand-made checkout elsewhere are never considered, whatever
// their state.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

import { currentWorktreeOf, listWorktrees } from './git-facts.mjs';
import { PROCESS_LISTING_NEEDS, processesUsing } from './process-cwds.mjs';

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
//
// A process listing that failed cannot say a worktree is unused, so it holds
// every unlocked one: both passes then act on nothing, by construction.
const USE_UNKNOWN = 'skip (use unknown)';

export function worktreeHold(worktree, processCwds) {
  if (worktree.locked) return { outcome: 'skip (locked)', reason: worktree.locked };
  if (!processCwds.ok) return { outcome: USE_UNKNOWN, reason: processCwds.reason };
  const users = processesUsing(worktree.real, processCwds.entries);
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
export function stillHeld(worktreePath, cwd, listCwds) {
  const live = listWorktrees(cwd).find((worktree) => worktree.path === worktreePath);
  return worktreeHold({ ...(live ?? {}), real: worktreePath }, listCwds());
}

// What both passes print, and fail an `--apply` run on, when a failed process
// listing held a worktree, at plan time or at the recheck before acting. The
// row carries the short reason; this adds what the listing needs to work.
export function unknownUseWarning(rows) {
  const held = rows.find((row) => row.outcome === USE_UNKNOWN);
  if (!held) return null;
  return `Cannot tell which worktrees are in use: ${held.reason}. ${PROCESS_LISTING_NEEDS}`;
}

// `git status --porcelain -z --ignored=matching` marks ignored entries with
// `!!` and lists each path that matches an ignore rule, with a trailing slash
// on a directory. The default `--ignored` mode instead collapses to the highest
// directory whose contents are all ignored, which hides `tools/redteam/output/`
// behind `tools/` in a checkout where nothing else under tools/ exists yet.
//
// `-z` is what lets a path be read as itself. Without it git C-quotes any path
// holding a space, a quote, a backslash, or a non-ASCII byte, and a quoted path
// matches no salvage prefix. With it each entry ends in NUL, and a rename or a
// copy carries its origin path as a second field, skipped here so that a path
// is never read as an entry. An entry that is not a two-character status and a
// space is output this parser would misread, so it throws rather than guess.
const STATUS_ENTRY = /^[ MTADRCU?!]{2} /;

export function parseIgnoredPaths(porcelain) {
  const fields = porcelain.split('\0');
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === '') continue;
    if (!STATUS_ENTRY.test(field)) {
      throw new Error(`unreadable git status entry: ${JSON.stringify(field)}`);
    }
    const status = field.slice(0, 2);
    if (status === '!!') paths.push(field.slice(3));
    else if (/[RC]/.test(status)) index += 1;
  }
  return paths;
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

// Read with spawnSync rather than the shared `git()`, which trims its output:
// trimming takes the leading space off a first entry such as ` M file`.
export function listIgnoredPaths(worktreePath, pathspecs = []) {
  const args = ['status', '--porcelain', '-z', '--ignored=matching', '--', ...pathspecs];
  const result = spawnSync('git', args, { cwd: worktreePath, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const why = result.error?.message ?? result.stderr.trim();
    throw new Error(`git ${args.join(' ')} failed in ${worktreePath}: ${why}`);
  }
  return parseIgnoredPaths(result.stdout);
}

// Only *ignored* content under the salvage prefixes is at risk: tracked
// evidence survives `git worktree remove` in the repository itself, so a
// worktree whose perf-profiles/ holds nothing but committed files is not held.
export function unsalvagedEvidence(worktreePath, prefixes = SALVAGE_PREFIXES) {
  const present = prefixes.filter((prefix) => existsSync(join(worktreePath, prefix)));
  if (present.length === 0) return [];
  return partitionIgnoredPaths(listIgnoredPaths(worktreePath, present), prefixes).salvage;
}
