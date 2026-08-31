import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { isMain } from './lib/proc.mjs';

const BRANCH_REF_PREFIX = 'refs/heads/';
const DELETE_SHA = /^0+$/;
const SNAPSHOT_ENV = 'SPLOTCH_STACK_REBASE_SNAPSHOT';

function runProcess(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function requireProcess(runCommand, command, args, options, failureMessage) {
  const result = runCommand(command, args, options);
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`${failureMessage}: ${detail}`);
  }
  return result.stdout?.trim() ?? '';
}

export function parsePushUpdates(input) {
  return input
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
      if (!localRef || !localSha || !remoteRef || !remoteSha) {
        throw new Error(`Malformed pre-push ref update: ${line}`);
      }
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function lowerStackUpdates(updates, pullRequests) {
  const childPrsByBase = Map.groupBy(pullRequests, ({ baseRefName }) => baseRefName);
  return updates
    .filter(
      ({ localRef, localSha }) =>
        localRef.startsWith(BRANCH_REF_PREFIX) && !DELETE_SHA.test(localSha)
    )
    .map((update) => ({
      ...update,
      branch: update.localRef.slice(BRANCH_REF_PREFIX.length),
    }))
    .filter(({ branch }) => childPrsByBase.has(branch))
    .map((update) => ({ ...update, childPrs: childPrsByBase.get(update.branch) }));
}

function listOpenPullRequests(runCommand) {
  const output = requireProcess(
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
    'Could not inspect live open pull requests; refusing an unguarded push'
  );
  return JSON.parse(output);
}

function readSnapshot(path) {
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.pullRequests)) {
    throw new Error('The rebased-stack snapshot has an unsupported shape');
  }
  return snapshot.pullRequests;
}

function resolveProposedBase(runCommand, remoteName, baseBranch, updates) {
  const proposedUpdate = updates.find(
    ({ remoteRef, localSha }) =>
      remoteRef === `${BRANCH_REF_PREFIX}${baseBranch}` && !DELETE_SHA.test(localSha)
  );
  if (proposedUpdate) return proposedUpdate.localSha;
  return requireProcess(
    runCommand,
    'git',
    ['rev-parse', `refs/remotes/${remoteName}/${baseBranch}`],
    {},
    `Could not resolve the proposed base for ${baseBranch}`
  );
}

function patchId(runCommand, baseSha, headSha) {
  const diff = requireProcess(
    runCommand,
    'git',
    ['diff', '--no-ext-diff', '--binary', baseSha, headSha, '--'],
    {},
    `Could not compare ${baseSha}..${headSha}`
  );
  if (!diff) return 'empty';
  const result = runCommand('git', ['patch-id', '--stable'], { input: diff });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`Could not identify the branch patch: ${detail}`);
  }
  return result.stdout.trim().split(/\s+/)[0];
}

function assertRebaseOnlyUpdate({ runCommand, remoteName, updates, update, snapshotPrs }) {
  const originalPr = snapshotPrs.find(({ headRefName }) => headRefName === update.branch);
  if (!originalPr) {
    throw new Error(`The rebase snapshot does not contain the lower PR branch ${update.branch}`);
  }
  const proposedBase = resolveProposedBase(runCommand, remoteName, originalPr.baseRefName, updates);
  const originalPatchId = patchId(runCommand, originalPr.baseRefOid, originalPr.headRefOid);
  const proposedPatchId = patchId(runCommand, proposedBase, update.localSha);
  if (originalPatchId !== proposedPatchId) {
    throw new Error(
      `Blocked a content change to lower PR #${originalPr.number} (${update.branch}). ` +
        "An intentional stack rebase may rewrite commit identities, but it must preserve this PR's patch. " +
        'Put the correction in a new commit at the stack tip.'
    );
  }
}

export function formatLowerPushBlock(lowerUpdates) {
  return lowerUpdates
    .map(({ branch, childPrs }) => {
      const children = childPrs.map(({ number, headRefName }) => `#${number} (${headRefName})`);
      return `${branch} has open child ${children.join(', ')}`;
    })
    .join('; ');
}

export function guardStackPush({
  input = readFileSync(0, 'utf8'),
  remoteName = process.argv[2] || 'origin',
  remoteUrl = process.argv[3] || '',
  env = process.env,
  runCommand = runProcess,
} = {}) {
  const updates = parsePushUpdates(input);
  if (!updates.some(({ localRef }) => localRef.startsWith(BRANCH_REF_PREFIX))) return;
  if (remoteUrl && !remoteUrl.includes('github.com')) return;

  const pullRequests = listOpenPullRequests(runCommand);
  const lowerUpdates = lowerStackUpdates(updates, pullRequests);
  if (lowerUpdates.length === 0) return;

  const snapshotPath = env[SNAPSHOT_ENV];
  if (!snapshotPath) {
    throw new Error(
      `Blocked push to a non-tip stacked PR: ${formatLowerPushBlock(lowerUpdates)}. ` +
        'Put fixes on the stack tip. After an intentional gh stack rebase, publish with ' +
        '`npm run stack:push:rebased` so the guard can prove every lower PR patch is unchanged.'
    );
  }

  const snapshotPrs = readSnapshot(snapshotPath);
  for (const update of lowerUpdates) {
    assertRebaseOnlyUpdate({ runCommand, remoteName, updates, update, snapshotPrs });
  }
}

if (isMain(import.meta.url)) {
  try {
    guardStackPush();
  } catch (error) {
    process.stderr.write(`stack push guard: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
