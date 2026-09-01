import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { isMain, ROOT } from './lib/proc.mjs';

const HOOKS_DIRECTORY = '.githooks';

function runProcess(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function managedWorktreeHooksPath(configuredPath, cwd, runCommand) {
  const worktrees = runCommand('git', ['worktree', 'list', '--porcelain'], cwd);
  if (worktrees.status !== 0) return false;
  const resolvedConfiguredPath = resolve(cwd, configuredPath);
  return worktrees.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length), HOOKS_DIRECTORY))
    .includes(resolvedConfiguredPath);
}

// The hooksPath override lets the linked-worktree integration tests use a
// disposable repository without changing this repository's shared Git config.
export function installStackPushGuard({
  cwd = process.cwd(),
  runCommand = runProcess,
  hooksPath = join(ROOT, HOOKS_DIRECTORY),
} = {}) {
  const guardHook = join(hooksPath, 'pre-push');
  if (!existsSync(guardHook)) {
    throw new Error(`no managed hook at ${guardHook}; run the installer from a product worktree`);
  }
  const current = runCommand('git', ['config', '--local', '--get', 'core.hooksPath'], cwd);
  if (current.status === 0) {
    const configuredPath = current.stdout.trim();
    const resolvedConfiguredPath = resolve(cwd, configuredPath);
    if (
      resolvedConfiguredPath !== hooksPath &&
      !managedWorktreeHooksPath(configuredPath, cwd, runCommand)
    ) {
      throw new Error(
        `core.hooksPath is already ${configuredPath}; refusing to replace an existing hook setup. ` +
          `Chain ${HOOKS_DIRECTORY}/pre-push from that hook path instead.`
      );
    }
    if (configuredPath === hooksPath) return false;
  }
  if (current.status !== 0 && current.status !== 1) {
    throw new Error(current.stderr?.trim() || 'Could not inspect core.hooksPath');
  }

  const configured = runCommand('git', ['config', '--local', 'core.hooksPath', hooksPath], cwd);
  if (configured.status !== 0) {
    throw new Error(configured.stderr?.trim() || 'Could not configure core.hooksPath');
  }
  return true;
}

if (isMain(import.meta.url)) {
  try {
    const installed = installStackPushGuard();
    if (installed) process.stdout.write('Installed the stacked-PR pre-push guard.\n');
  } catch (error) {
    process.stderr.write(
      `stack push guard installer: ${error instanceof Error ? error.message : error}\n`
    );
    process.exitCode = 1;
  }
}
