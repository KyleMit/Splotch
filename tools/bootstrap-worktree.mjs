import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { isMain } from './lib/proc.mjs';

const FAILURE_DETAIL_CHAR_LIMIT = 800;
const MAIN_REF = 'refs/heads/main';

export const RUNNERS = ['claude', 'codex'];

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
      'tracked changes are present. Preserve or discard them explicitly before restarting the session.'
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

/**
 * A Codex worktree starts detached at whatever `main` pointed to when it was cut, so it needs a
 * refresh before the first turn. A Claude worktree is already branched from the remote default by
 * `worktree.baseRef`, arrives on its own branch, and must not be moved.
 */
function needsStaleMainRefresh(runCommand, repoRoot) {
  const branch = requireCommand(
    runCommand,
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    repoRoot,
    'Could not inspect HEAD'
  );
  if (branch !== 'HEAD') return false;

  const initialHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not read the initial worktree commit'
  );
  const localMain = readLocalMain(runCommand, repoRoot);
  return localMain !== null && initialHead === localMain;
}

export function bootstrapWorktree({ cwd = process.cwd(), runCommand = runProcess } = {}) {
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

    if (needsStaleMainRefresh(runCommand, repoRoot)) updateStaleMainWorktree(runCommand, repoRoot);
    provisionDependencies(runCommand, repoRoot);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Claude Code leaves `CLAUDE_PROJECT_DIR` — and so the hook command's own path — pointing at the
 * main checkout, and reports the worktree only through the payload's `cwd`.
 */
export function readHookCwd(payload) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    const cwd = parsed?.cwd;
    return typeof cwd === 'string' && cwd ? cwd : null;
  } catch {
    return null;
  }
}

function readStdin() {
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return null;
  }
}

function parseRunner(argv) {
  const flag = argv.find((arg) => arg.startsWith('--runner='));
  const runner = flag?.slice('--runner='.length);
  if (!RUNNERS.includes(runner)) {
    throw new Error(`--runner must be one of ${RUNNERS.join(', ')}`);
  }
  return runner;
}

/**
 * Codex reads a stop decision from the hook's stdout; Claude Code reads a non-blocking failure from
 * a non-zero exit plus stderr, and lets the session start so the message is actionable in place.
 */
export function reportFailure(runner, reason) {
  const message = `Splotch worktree bootstrap stopped: ${reason}`;
  if (runner === 'codex') {
    return {
      stdout: { continue: false, stopReason: message, systemMessage: message },
      exitCode: 0,
    };
  }
  return { stdout: { systemMessage: message }, stderr: message, exitCode: 1 };
}

if (isMain(import.meta.url)) {
  const runner = parseRunner(process.argv.slice(2));
  const cwd = readHookCwd(readStdin()) ?? process.cwd();
  const reason = bootstrapWorktree({ cwd });
  if (reason) {
    const { stdout, stderr, exitCode } = reportFailure(runner, reason);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.stdout.write(`${JSON.stringify(stdout)}\n`);
    process.exitCode = exitCode;
  }
}
