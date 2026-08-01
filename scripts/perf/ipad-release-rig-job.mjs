import { spawnSync } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const DEFAULT_STATE_DIR = join(homedir(), 'Library', 'Application Support', 'SplotchPerfRig');
export const COMPLETED_RELEASE_TAGS_FILE = 'completed-release-tags.json';
const TRUSTED_TAG_PREFIX = 'refs/splotch-rig/tags/';

export function redactCommandArgs(args) {
  return args.map((arg) => (arg.startsWith('--device-id=') ? '--device-id=<private-device>' : arg));
}

function command(commandName, args, { cwd = ROOT, allowFailure = false, capture = false } = {}) {
  const loggedArgs = redactCommandArgs(args);
  console.log('$', commandName, ...loggedArgs);
  const result = spawnSync(commandName, args, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${commandName} ${loggedArgs.join(' ')} exited ${result.status ?? 'without a status'}${capture ? `\n${result.stderr}` : ''}`
    );
  }
  return capture ? (result.stdout ?? '').trim() : result.status === 0;
}

export function scheduledRigPlan({ cadence, deviceId, deviceModel }) {
  if (!['fast', 'release'].includes(cadence)) {
    throw new Error('--cadence must be fast or release');
  }
  if (!deviceId || !deviceModel) throw new Error('--device-id and --device-model are required');
  return {
    cadence,
    suite: cadence === 'fast' ? 'fast' : 'full',
    deviceId,
    deviceModel,
    trigger: cadence === 'fast' ? 'weekly Sunday 03:00' : 'daily 04:00, unseen v* tag only',
  };
}

function requireSafeRemote(repo) {
  const remote = command('git', ['remote', 'get-url', 'origin'], { cwd: repo, capture: true });
  if (/^https?:\/\/[^/]*@/i.test(remote)) {
    throw new Error(
      'origin embeds a credential in its URL. Use SSH or the system credential helper so logs and process listings cannot expose a token.'
    );
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export function acquireJobLock(lockPath) {
  try {
    const lock = openSync(lockPath, 'wx', 0o600);
    writeFileSync(lock, `${process.pid}\n`);
    return lock;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  let ownerPid;
  try {
    ownerPid = Number(readFileSync(lockPath, 'utf8').trim());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (processIsRunning(ownerPid)) return undefined;

  try {
    unlinkSync(lockPath);
    const lock = openSync(lockPath, 'wx', 0o600);
    writeFileSync(lock, `${process.pid}\n`);
    return lock;
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function trustedReleaseTags(repo) {
  return command(
    'git',
    ['for-each-ref', '--sort=version:refname', '--format=%(refname)', `${TRUSTED_TAG_PREFIX}v*`],
    { cwd: repo, capture: true }
  )
    .split('\n')
    .filter(Boolean)
    .map((ref) => ({ name: ref.slice(TRUSTED_TAG_PREFIX.length), ref }));
}

function prepareMain(repo) {
  if (command('git', ['branch', '--show-current'], { cwd: repo, capture: true }) !== 'main') {
    throw new Error('The scheduled rig requires a dedicated clone checked out on main');
  }
  if (command('git', ['status', '--porcelain'], { cwd: repo, capture: true })) {
    throw new Error('The scheduled rig clone is dirty; refusing to publish over local work');
  }
  requireSafeRemote(repo);
  command(
    'git',
    [
      'fetch',
      '--prune',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
      '+refs/tags/v*:refs/splotch-rig/tags/v*',
    ],
    { cwd: repo }
  );
  command('git', ['merge', '--ff-only', 'origin/main'], { cwd: repo });
  const localHead = command('git', ['rev-parse', 'HEAD'], { cwd: repo, capture: true });
  const remoteHead = command('git', ['rev-parse', 'origin/main'], { cwd: repo, capture: true });
  if (localHead !== remoteHead) {
    throw new Error('The scheduled rig main branch must exactly match origin/main');
  }
  return trustedReleaseTags(repo);
}

function runRig(repo, outputDir, plan, releaseTag) {
  command(
    process.execPath,
    [
      join(repo, 'scripts', 'perf', 'ipad-release-rig.mjs'),
      `--suite=${plan.suite}`,
      '--repeats=3',
      `--device-id=${plan.deviceId}`,
      `--device-model=${plan.deviceModel}`,
      `--output=${outputDir}`,
      ...(releaseTag ? [`--release-tag=${releaseTag}`] : []),
    ],
    { cwd: repo }
  );
}

function publish(repo, reportDir) {
  const artifact = JSON.parse(readFileSync(join(reportDir, 'ipad-gates.json'), 'utf8'));
  const { metadata } = artifact;
  const stamp = metadata.capturedAt.replace(/[:.]/g, '-');
  const slug = `${stamp}-${metadata.appVersion}-${metadata.suite}`;
  const destination = `performance/ipad-release-rig/${slug}`;
  command('npm', ['run', 'scrapbook:publish', '--', reportDir, destination], { cwd: repo });
  command('node', ['scripts/perf/ipad-release-index.mjs'], { cwd: repo });
  command('npm', ['run', 'scrapbook:index'], { cwd: repo });
  command('git', ['add', 'scrapbook/index.html', 'scrapbook/performance/ipad-release-rig'], {
    cwd: repo,
  });
  command(
    'git',
    [
      'commit',
      '-m',
      `Publish iPad ${metadata.suite} performance ${metadata.capturedAt.slice(0, 10)}`,
    ],
    {
      cwd: repo,
    }
  );
  command('git', ['push', 'origin', 'HEAD:main'], { cwd: repo });
  return { metadata, destination };
}

function preparePublicationWorktree(repo, worktree) {
  command('git', ['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'], { cwd: repo });
  command('git', ['worktree', 'add', '--detach', worktree, 'origin/main'], { cwd: repo });
  command('npm', ['ci'], { cwd: worktree });
}

export function firstUnmeasuredReleaseTag(tags, completedTags) {
  const completed = new Set(completedTags);
  return tags.find(({ name }) => !completed.has(name));
}

function readCompletedReleaseTags(stateDir) {
  try {
    const tags = JSON.parse(readFileSync(join(stateDir, COMPLETED_RELEASE_TAGS_FILE), 'utf8'));
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
      throw new Error('expected a JSON array of tag names');
    }
    return tags;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Invalid ${COMPLETED_RELEASE_TAGS_FILE}: ${error.message}`, { cause: error });
  }
}

function writeCompletedReleaseTags(stateDir, tags) {
  writeFileSync(
    join(stateDir, COMPLETED_RELEASE_TAGS_FILE),
    `${JSON.stringify([...new Set(tags)], null, 2)}\n`,
    { mode: 0o600 }
  );
}

export async function runScheduledIpadRig(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      cadence: { type: 'string' },
      repo: { type: 'string', default: ROOT },
      'device-id': { type: 'string' },
      'device-model': { type: 'string' },
      'state-dir': { type: 'string', default: DEFAULT_STATE_DIR },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const plan = scheduledRigPlan({
    cadence: values.cadence,
    deviceId: values['device-id'],
    deviceModel: values['device-model'],
  });
  if (values['dry-run']) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  if (process.platform !== 'darwin') throw new Error('The launchd iPad rig requires macOS');

  const repo = resolve(values.repo);
  const stateDir = resolve(values['state-dir']);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lockPath = join(stateDir, 'job.lock');
  const lock = acquireJobLock(lockPath);
  if (lock === undefined) {
    console.log('Another iPad release-rig job is active; skipping.');
    return { skipped: 'locked' };
  }

  let releaseWorktree;
  let publicationWorktree;
  try {
    const releaseTags = prepareMain(repo);
    let runRepo = repo;
    let releaseTag;
    let completedTags;
    if (plan.cadence === 'release') {
      completedTags = readCompletedReleaseTags(stateDir);
      const selected = firstUnmeasuredReleaseTag(releaseTags, completedTags);
      if (!selected) {
        console.log('No unseen v* release tag is available; skipping.');
        return { skipped: 'no-unseen-release-tag' };
      }
      releaseTag = selected.name;
      if (
        !command('git', ['merge-base', '--is-ancestor', selected.ref, 'origin/main'], {
          cwd: repo,
          allowFailure: true,
        })
      ) {
        throw new Error(`${releaseTag} is not an ancestor of origin/main`);
      }
      releaseWorktree = join(
        tmpdir(),
        `splotch-ipad-${releaseTag.replace(/[^\w.-]/g, '-')}-${process.pid}`
      );
      command('git', ['worktree', 'add', '--detach', releaseWorktree, selected.ref], { cwd: repo });
      command('npm', ['ci'], { cwd: releaseWorktree });
      runRepo = releaseWorktree;
    } else {
      command('npm', ['ci'], { cwd: repo });
    }

    const reportRoot = join(stateDir, 'out', `${Date.now()}-${plan.suite}`);
    const reportDir = join(reportRoot, 'report');
    runRig(runRepo, reportDir, plan, releaseTag);
    publicationWorktree = join(tmpdir(), `splotch-ipad-publish-${Date.now()}-${process.pid}`);
    preparePublicationWorktree(repo, publicationWorktree);
    const published = publish(publicationWorktree, reportDir);
    if (releaseTag) writeCompletedReleaseTags(stateDir, [...completedTags, releaseTag]);
    rmSync(reportRoot, { recursive: true, force: true });
    return published;
  } finally {
    if (publicationWorktree)
      command('git', ['worktree', 'remove', publicationWorktree, '--force'], {
        cwd: repo,
        allowFailure: true,
      });
    if (releaseWorktree)
      command('git', ['worktree', 'remove', releaseWorktree, '--force'], {
        cwd: repo,
        allowFailure: true,
      });
    closeSync(lock);
    try {
      unlinkSync(lockPath);
    } catch {
      // A supervisor may clean a stale lock left by an interrupted job.
    }
  }
}

if (isMain(import.meta.url)) runMain(runScheduledIpadRig);
