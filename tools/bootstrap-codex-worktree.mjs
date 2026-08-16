import { spawnSync } from 'node:child_process';

import { isMain } from './lib/proc.mjs';

const FAILURE_DETAIL_CHAR_LIMIT = 800;
const MAIN_REF = 'refs/heads/main';

function runProcess(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function failureDetail(result) {
  const output = result.stderr?.trim() || result.stdout?.trim() || result.error?.message;
  if (output) return output.slice(-FAILURE_DETAIL_CHAR_LIMIT);
  if (result.signal) return `terminated by ${result.signal}`;
  return `exit ${result.status ?? 'unknown'}`;
}

function requireCommand(runCommand, command, args, cwd, failureMessage) {
  const result = runCommand(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${failureMessage}: ${failureDetail(result)}`);
  }
  return result.stdout?.trim() ?? '';
}

function stopTurn(reason) {
  const message = `Splotch worktree bootstrap stopped: ${reason}`;
  return { continue: false, stopReason: message, systemMessage: message };
}

function readLocalMain(runCommand, repoRoot) {
  const result = runCommand('git', ['rev-parse', MAIN_REF], repoRoot);
  if (result.status !== 0) return null;
  return result.stdout?.trim() ?? '';
}

function updateStaleMainWorktree(runCommand, repoRoot) {
  const trackedChanges = requireCommand(
    runCommand,
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    repoRoot,
    'Could not inspect tracked worktree changes'
  );
  if (trackedChanges) {
    throw new Error(
      'tracked changes are present. Preserve or discard them explicitly before restarting Codex.'
    );
  }

  requireCommand(
    runCommand,
    'git',
    ['fetch', '--no-tags', 'origin', 'main'],
    repoRoot,
    'Could not fetch origin/main; check network and remote access, then restart the session'
  );
  const fetchedHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'FETCH_HEAD'],
    repoRoot,
    'Could not read the fetched main commit'
  );
  requireCommand(
    runCommand,
    'git',
    ['checkout', '--detach', 'FETCH_HEAD'],
    repoRoot,
    'Could not detach the worktree at fetched origin/main'
  );
  const checkedOutHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not verify the checked-out commit'
  );
  if (checkedOutHead !== fetchedHead) {
    throw new Error(
      `checkout verification failed: HEAD is ${checkedOutHead}, expected ${fetchedHead}.`
    );
  }
}

function tryEnablePnpmShim(runCommand, repoRoot) {
  runCommand('corepack', ['enable', 'pnpm'], repoRoot);
}

function provisionDependencies(runCommand, repoRoot) {
  tryEnablePnpmShim(runCommand, repoRoot);
  requireCommand(
    runCommand,
    'corepack',
    ['install'],
    repoRoot,
    'Could not provision the pinned pnpm version'
  );
  requireCommand(
    runCommand,
    'pnpm',
    ['install', '--frozen-lockfile', '--prefer-offline'],
    repoRoot,
    'Could not install project dependencies; check the pnpm output, then restart the session'
  );
  requireCommand(
    runCommand,
    'npm',
    ['run', 'info'],
    repoRoot,
    'Dependency verification failed because npm run info did not succeed'
  );
}

export function bootstrapCodexWorktree({ cwd = process.cwd(), runCommand = runProcess } = {}) {
  try {
    const gitDir = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--path-format=absolute', '--git-dir'],
      cwd,
      'Could not inspect the Git directory'
    );
    const commonDir = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      cwd,
      'Could not inspect the common Git directory'
    );

    if (gitDir === commonDir) return null;

    const repoRoot = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--show-toplevel'],
      cwd,
      'Could not locate the linked worktree root'
    );
    const branch = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repoRoot,
      'Could not inspect HEAD'
    );
    if (branch !== 'HEAD') return null;

    const initialHead = requireCommand(
      runCommand,
      'git',
      ['rev-parse', 'HEAD'],
      repoRoot,
      'Could not read the initial worktree commit'
    );
    const localMain = readLocalMain(runCommand, repoRoot);
    if (localMain === null) return null;

    if (initialHead === localMain) updateStaleMainWorktree(runCommand, repoRoot);
    provisionDependencies(runCommand, repoRoot);

    return null;
  } catch (error) {
    return stopTurn(error instanceof Error ? error.message : String(error));
  }
}

if (isMain(import.meta.url)) {
  const result = bootstrapCodexWorktree();
  if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
}
