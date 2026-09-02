// Publish an intentional `gh stack rebase`, proving no lower PR's content changed.
//
// A rebase may rewrite commit identities; it must not rewrite what a reviewed PR
// says. The pre-push hook that used to prove that ran on EVERY push and refused
// when it could not reach `gh`, which made every push from a cloud session
// impossible — so it was removed. This check survives it because it is opt-in:
// it runs when someone deliberately publishes a rebase, which is already a
// `gh`-shaped operation on a developer's own machine.
//
// It guards exactly the PRs the hook guarded: those that are the base of another
// open PR. The stack tip is deliberately excluded — new commits legitimately
// land there, so comparing its patch would fail the one branch that is allowed
// to change.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isMain } from './lib/proc.mjs';

const FAILURE_DETAIL_CHAR_LIMIT = 800;

function runProcess(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function requireProcess(runCommand, command, args, options, failureMessage) {
  const result = runCommand(command, args, options);
  if (result.status !== 0) {
    const output = result.stderr?.trim() || result.error?.message || result.stdout?.trim();
    const detail = output ? output.slice(-FAILURE_DETAIL_CHAR_LIMIT) : `exit ${result.status}`;
    throw new Error(`${failureMessage}: ${detail}`);
  }
  return result.stdout?.trim() ?? '';
}

function captureOpenPullRequests(runCommand) {
  return JSON.parse(
    requireProcess(
      runCommand,
      'gh',
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '1000',
        '--json',
        'number,headRefName,headRefOid,baseRefName,baseRefOid,url',
      ],
      {},
      'Could not read the open pull requests, so no rebase could be proven safe'
    )
  );
}

// A PR whose branch another open PR is based on. Exactly the set the removed
// pre-push hook refused content changes to.
export function lowerPullRequests(pullRequests) {
  const bases = new Set(pullRequests.map(({ baseRefName }) => baseRefName));
  return pullRequests.filter(({ headRefName }) => bases.has(headRefName));
}

// `git patch-id` over a range, via a temp file: the diff is binary-safe and can
// be large, so it is never carried through a shell pipe.
function patchId(runCommand, baseSha, headSha) {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-stack-patch-'));
  const diffPath = join(directory, 'branch.diff');
  try {
    requireProcess(
      runCommand,
      'git',
      [
        'diff',
        '--no-ext-diff',
        '--binary',
        `--output=${diffPath}`,
        `${baseSha}...${headSha}`,
        '--',
      ],
      {},
      `Could not compare ${baseSha}...${headSha}`
    );
    if (statSync(diffPath).size === 0) return 'empty';
    const diffFile = openSync(diffPath, 'r');
    try {
      return requireProcess(
        runCommand,
        'git',
        ['patch-id', '--stable'],
        { stdio: [diffFile, 'pipe', 'pipe'] },
        'Could not identify the branch patch'
      ).split(/\s+/)[0];
    } finally {
      closeSync(diffFile);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function resolveLocalSha(runCommand, ref) {
  const result = runCommand('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {});
  return result.status === 0 ? (result.stdout?.trim() ?? '') : null;
}

// The rebased counterpart of a PR's base: the local branch when the rebase moved
// it too, otherwise what the remote still holds.
function resolveRebasedBase(runCommand, remoteName, baseRefName) {
  return (
    resolveLocalSha(runCommand, `refs/heads/${baseRefName}`) ??
    resolveLocalSha(runCommand, `refs/remotes/${remoteName}/${baseRefName}`)
  );
}

export function assertPatchPreserved({ runCommand, remoteName, pullRequest }) {
  const rebasedHead = resolveLocalSha(runCommand, `refs/heads/${pullRequest.headRefName}`);
  // Not checked out here, so this rebase cannot be rewriting it.
  if (!rebasedHead) return 'skipped';
  if (rebasedHead === pullRequest.headRefOid) return 'unchanged';

  const rebasedBase = resolveRebasedBase(runCommand, remoteName, pullRequest.baseRefName);
  if (!rebasedBase) {
    throw new Error(
      `Could not resolve the rebased base ${pullRequest.baseRefName} for PR #${pullRequest.number}`
    );
  }

  const original = patchId(runCommand, pullRequest.baseRefOid, pullRequest.headRefOid);
  const rebased = patchId(runCommand, rebasedBase, rebasedHead);
  if (original !== rebased) {
    throw new Error(
      `Refusing to publish: the rebase changed the content of PR #${pullRequest.number} ` +
        `(${pullRequest.headRefName}). A rebase may rewrite commit identities, but a PR with ` +
        'another PR based on it must keep its own patch. Put the change in a new commit at the ' +
        'stack tip instead.'
    );
  }
  return 'preserved';
}

export function pushRebasedStack({
  args = process.argv.slice(2),
  remoteName = 'origin',
  runCommand = runProcess,
  loadPullRequests = captureOpenPullRequests,
} = {}) {
  const pullRequests = loadPullRequests(runCommand);
  const lower = lowerPullRequests(pullRequests);

  // The recorded pre-rebase commits have to be readable to be compared, and a
  // branch rewritten locally may no longer reach them by any ref.
  if (lower.length > 0) {
    requireProcess(
      runCommand,
      'git',
      ['fetch', remoteName],
      {},
      `Could not fetch ${remoteName} to read the pre-rebase commits`
    );
  }

  for (const pullRequest of lower) {
    assertPatchPreserved({ runCommand, remoteName, pullRequest });
  }

  const result = runCommand('gh', ['stack', 'push', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`gh stack push exited ${result.status}`);
}

if (isMain(import.meta.url)) {
  try {
    pushRebasedStack();
  } catch (error) {
    process.stderr.write(`rebased stack push: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
