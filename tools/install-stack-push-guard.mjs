import { spawnSync } from 'node:child_process';

import { isMain } from './lib/proc.mjs';

const HOOKS_PATH = '.githooks';

function runProcess(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

export function installStackPushGuard({ cwd = process.cwd(), runCommand = runProcess } = {}) {
  const current = runCommand('git', ['config', '--local', '--get', 'core.hooksPath'], cwd);
  if (current.status === 0) {
    const configuredPath = current.stdout.trim();
    if (configuredPath === HOOKS_PATH) return false;
    throw new Error(
      `core.hooksPath is already ${configuredPath}; refusing to replace an existing hook setup. ` +
        `Chain ${HOOKS_PATH}/pre-push from that hook path instead.`
    );
  }
  if (current.status !== 1) {
    throw new Error(current.stderr?.trim() || 'Could not inspect core.hooksPath');
  }

  const configured = runCommand('git', ['config', '--local', 'core.hooksPath', HOOKS_PATH], cwd);
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
