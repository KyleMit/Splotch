import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OID_PATTERN = /^[0-9a-f]{40}$/;
export const SCOPE_KINDS = Object.freeze(['uncommitted', 'base', 'commit', 'pr']);

export function git(repoRoot, args, { env, allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowFailure) return undefined;
    throw new Error(`git ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function requireOid(value, what) {
  if (!OID_PATTERN.test(value ?? '')) throw new Error(`${what} is not a full commit id: ${value}`);
  return value;
}

// The working tree — tracked changes plus untracked, non-ignored files — becomes a real commit
// through a private index, so the uncommitted scope is pinned to an OID like every other scope and
// the shared stash stack is never touched. The commit is dangling on purpose: nothing references
// it, and git's own gc reaps it once the review is over.
export function snapshotWorkingTree(repoRoot) {
  const indexDirectory = mkdtempSync(join(tmpdir(), 'splotch-rival-index-'));
  const env = { GIT_INDEX_FILE: join(indexDirectory, 'index') };
  try {
    git(repoRoot, ['read-tree', 'HEAD'], { env });
    git(repoRoot, ['add', '--all'], { env });
    const tree = git(repoRoot, ['write-tree'], { env });
    const head = git(repoRoot, ['rev-parse', 'HEAD']);
    return requireOid(
      git(repoRoot, ['commit-tree', tree, '-p', head, '-m', 'rival-agent working-tree snapshot'], {
        env: { ...env, GIT_AUTHOR_NAME: 'rival-agent', GIT_AUTHOR_EMAIL: 'rival-agent@splotch' },
      }),
      'snapshot commit'
    );
  } finally {
    rmSync(indexDirectory, { recursive: true, force: true });
  }
}

export function resolveScope(repoRoot, scope) {
  if (scope.kind === 'uncommitted') {
    const base = requireOid(git(repoRoot, ['rev-parse', 'HEAD']), 'HEAD');
    return {
      base,
      head: snapshotWorkingTree(repoRoot),
      description: 'the working tree against HEAD',
    };
  }
  if (scope.kind === 'commit') {
    const head = requireOid(git(repoRoot, ['rev-parse', `${scope.commit}^{commit}`]), scope.commit);
    const base = requireOid(git(repoRoot, ['rev-parse', `${head}^`]), `${scope.commit}^`);
    return { base, head, description: `commit ${head}` };
  }
  if (scope.kind === 'base') {
    const head = requireOid(git(repoRoot, ['rev-parse', 'HEAD']), 'HEAD');
    const base = requireOid(
      git(repoRoot, ['merge-base', scope.base, head]),
      `merge-base ${scope.base}`
    );
    return { base, head, description: `this branch against ${scope.base}` };
  }
  if (scope.kind === 'pr') {
    return {
      base: requireOid(scope.baseRefOid, 'PR base'),
      head: requireOid(scope.headRefOid, 'PR head'),
      description: `pull request ${scope.number}`,
    };
  }
  throw new Error(`unknown scope kind ${scope.kind}`);
}

// A linked worktree resolves nothing upward, so dependencies install into it (frozen, from the
// warm store: about three seconds) or Vitest and Prettier fail there in confusing ways.
// `--ignore-scripts` because the reviewed commit owns package.json: a PR-controlled postinstall
// would otherwise run on the handler's machine at launch, before anyone has read the diff. Native
// modules still arrive built from the store's side-effects cache (measured: sharp, esbuild).
export const WORKTREE_INSTALL_ARGS = Object.freeze([
  'install',
  '--frozen-lockfile',
  '--prefer-offline',
  '--ignore-scripts',
]);

export function createDisposableWorktree(repoRoot, head, directory, { install = true } = {}) {
  git(repoRoot, ['worktree', 'add', '--detach', directory, head]);
  if (!install) return directory;
  const result = spawnSync('pnpm', [...WORKTREE_INSTALL_ARGS], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    removeDisposableWorktree(repoRoot, directory);
    throw new Error(
      `pnpm install failed in the disposable worktree: ${result.error?.message ?? result.stderr.trim()}`
    );
  }
  return directory;
}

export function removeDisposableWorktree(repoRoot, directory) {
  git(repoRoot, ['worktree', 'remove', '--force', directory], { allowFailure: true });
  rmSync(directory, { recursive: true, force: true });
  git(repoRoot, ['worktree', 'prune'], { allowFailure: true });
}

// What the rival reads instead of asking the handler for git: the exact range as a patch, the
// commit story, and the touched files. Measured from past reviews, that is most of the shell
// commands a reviewer runs.
export const PACKET_FILES = Object.freeze({
  diff: 'diff.patch',
  commits: 'commits.txt',
  files: 'files.txt',
  scope: 'scope.json',
});
// GitHub renders the diff with three context lines, and every rendered line accepts a review
// comment; a line outside a rendered hunk rejects the whole review. Pinned on the command line so
// a developer's diff.context setting cannot widen the packet past what the poster can anchor to.
export const DIFF_CONTEXT_LINES = 3;

export function writeReviewPacket(repoRoot, { base, head, description }, directory) {
  const range = `${base}...${head}`;
  writeFileSync(
    join(directory, PACKET_FILES.diff),
    `${git(repoRoot, ['diff', `--unified=${DIFF_CONTEXT_LINES}`, range])}\n`
  );
  writeFileSync(
    join(directory, PACKET_FILES.commits),
    `${git(repoRoot, ['log', '--oneline', '--no-decorate', `${base}..${head}`])}\n`
  );
  writeFileSync(
    join(directory, PACKET_FILES.files),
    `${git(repoRoot, ['diff', '--name-status', range])}\n`
  );
  writeFileSync(
    join(directory, PACKET_FILES.scope),
    `${JSON.stringify({ base, head, description, range }, null, 2)}\n`
  );
  return directory;
}
