import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isMain } from './lib/proc.mjs';

const SNAPSHOT_ENV = 'SPLOTCH_STACK_REBASE_SNAPSHOT';

function captureOpenPullRequests(runCommand = spawnSync) {
  const result = runCommand(
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
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Could not snapshot the open pull requests');
  }
  return JSON.parse(result.stdout);
}

export function pushRebasedStack({
  args = process.argv.slice(2),
  runCommand = spawnSync,
  loadPullRequests = captureOpenPullRequests,
} = {}) {
  const snapshotDirectory = mkdtempSync(join(tmpdir(), 'splotch-stack-rebase-'));
  const snapshotPath = join(snapshotDirectory, 'pull-requests.json');
  try {
    writeFileSync(
      snapshotPath,
      `${JSON.stringify({ schemaVersion: 1, pullRequests: loadPullRequests() })}\n`
    );
    const result = runCommand('gh', ['stack', 'push', ...args], {
      stdio: 'inherit',
      env: { ...process.env, [SNAPSHOT_ENV]: snapshotPath },
    });
    if (result.status !== 0) throw new Error(`gh stack push exited ${result.status}`);
  } finally {
    rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    pushRebasedStack();
  } catch (error) {
    process.stderr.write(`rebased stack push: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
