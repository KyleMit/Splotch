import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapCodexWorktree } from '../bootstrap-codex-worktree.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const SESSION_CWD = '/worktree/web/src';
const WORKTREE_ROOT = '/worktree';
const INITIAL_HEAD = '1111111111111111111111111111111111111111';
const FETCHED_HEAD = '2222222222222222222222222222222222222222';

const commandKey = (command, args) => JSON.stringify([command, ...args]);
const success = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const failure = (stderr) => ({ status: 1, stdout: '', stderr });

function defaultScript() {
  return new Map([
    [
      commandKey('git', ['rev-parse', '--path-format=absolute', '--git-dir']),
      [success('/git/worktrees/task')],
    ],
    [
      commandKey('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      [success('/git')],
    ],
    [commandKey('git', ['rev-parse', '--show-toplevel']), [success(WORKTREE_ROOT)]],
    [commandKey('git', ['rev-parse', '--abbrev-ref', 'HEAD']), [success('HEAD')]],
    [commandKey('git', ['rev-parse', 'HEAD']), [success(INITIAL_HEAD), success(FETCHED_HEAD)]],
    [commandKey('git', ['rev-parse', 'refs/heads/main']), [success(INITIAL_HEAD)]],
    [commandKey('git', ['status', '--porcelain', '--untracked-files=no']), [success()]],
    [commandKey('git', ['fetch', '--no-tags', 'origin', 'main']), [success()]],
    [commandKey('git', ['rev-parse', 'FETCH_HEAD']), [success(FETCHED_HEAD)]],
    [commandKey('git', ['checkout', '--detach', 'FETCH_HEAD']), [success()]],
    [commandKey('corepack', ['enable', 'pnpm']), [success()]],
    [commandKey('corepack', ['install']), [success()]],
    [commandKey('pnpm', ['install', '--frozen-lockfile', '--prefer-offline']), [success()]],
    [commandKey('npm', ['run', 'info']), [success()]],
  ]);
}

function createRunner(script = defaultScript()) {
  const calls = [];
  const runCommand = (command, args, cwd) => {
    calls.push({ command, args, cwd });
    const results = script.get(commandKey(command, args));
    return results?.shift() ?? failure(`Unexpected command: ${command} ${args.join(' ')}`);
  };
  return { calls, runCommand };
}

function commandNames(calls) {
  return calls.map(({ command, args }) => [command, ...args].join(' '));
}

describe('Codex worktree bootstrap hook', () => {
  it('registers one synchronous startup-only hook through the repository root', () => {
    const config = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8'));
    const group = config.hooks.SessionStart[0];
    const hook = group.hooks[0];

    expect(group.matcher).toBe('^startup$');
    expect(hook.type).toBe('command');
    expect(hook.command).toBe(
      'node "$(git rev-parse --show-toplevel)/tools/bootstrap-codex-worktree.mjs"'
    );
    expect(hook.async).toBeUndefined();
  });

  it('prints structured stop output when the executable cannot inspect Git', () => {
    const run = spawnSync(
      process.execPath,
      [join(repoRoot, 'tools', 'bootstrap-codex-worktree.mjs')],
      {
        cwd: '/tmp',
        encoding: 'utf8',
      }
    );

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      continue: false,
      stopReason: expect.stringContaining('Could not inspect the Git directory'),
      systemMessage: expect.stringContaining('Splotch worktree bootstrap stopped'),
    });
  });

  it('exits without side effects in the primary checkout', () => {
    const script = new Map([
      [
        commandKey('git', ['rev-parse', '--path-format=absolute', '--git-dir']),
        [success('/repo/.git')],
      ],
      [
        commandKey('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']),
        [success('/repo/.git')],
      ],
    ]);
    const runner = createRunner(script);

    expect(bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
    ]);
  });

  it('updates a stale main worktree before installing and verifying dependencies', () => {
    const runner = createRunner();

    expect(bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
      'git rev-parse --show-toplevel',
      'git rev-parse --abbrev-ref HEAD',
      'git rev-parse HEAD',
      'git rev-parse refs/heads/main',
      'git status --porcelain --untracked-files=no',
      'git fetch --no-tags origin main',
      'git rev-parse FETCH_HEAD',
      'git checkout --detach FETCH_HEAD',
      'git rev-parse HEAD',
      'corepack enable pnpm',
      'corepack install',
      'pnpm install --frozen-lockfile --prefer-offline',
      'npm run info',
    ]);
    expect(runner.calls.slice(0, 3).map(({ cwd }) => cwd)).toEqual([
      SESSION_CWD,
      SESSION_CWD,
      SESSION_CWD,
    ]);
    expect(runner.calls.slice(3).every(({ cwd }) => cwd === WORKTREE_ROOT)).toBe(true);
  });

  it('leaves a feature-based detached worktree untouched', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [success(FETCHED_HEAD)]);
    const runner = createRunner(script);

    expect(bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
      'git rev-parse --show-toplevel',
      'git rev-parse --abbrev-ref HEAD',
      'git rev-parse HEAD',
      'git rev-parse refs/heads/main',
    ]);
  });

  it('stops before fetching when tracked changes are present', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['status', '--porcelain', '--untracked-files=no']), [
      success(' M tracked.txt'),
    ]);
    const runner = createRunner(script);

    const result = bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(result).toMatchObject({ continue: false });
    expect(result.systemMessage).toContain('tracked changes are present');
    expect(commandNames(runner.calls)).not.toContain('git fetch --no-tags origin main');
  });

  it('stops before fetching when the linked worktree is not detached', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', '--abbrev-ref', 'HEAD']), [success('main')]);
    const runner = createRunner(script);

    const result = bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(result).toMatchObject({ continue: false });
    expect(result.stopReason).toContain('HEAD is attached to main');
    expect(commandNames(runner.calls)).not.toContain('git fetch --no-tags origin main');
  });

  it.each([
    {
      name: 'fetch',
      command: ['git', 'fetch', '--no-tags', 'origin', 'main'],
      message: 'Could not fetch origin/main',
    },
    {
      name: 'checkout',
      command: ['git', 'checkout', '--detach', 'FETCH_HEAD'],
      message: 'Could not detach the worktree',
    },
    {
      name: 'dependency install',
      command: ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'],
      message: 'Could not install project dependencies',
    },
    {
      name: 'dependency verification',
      command: ['npm', 'run', 'info'],
      message: 'Dependency verification failed',
    },
  ])('returns structured stop output on $name failure', ({ command, message }) => {
    const script = defaultScript();
    script.set(commandKey(command[0], command.slice(1)), [failure('simulated failure')]);
    const runner = createRunner(script);

    const result = bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(result).toEqual({
      continue: false,
      stopReason: expect.stringContaining(message),
      systemMessage: expect.stringContaining('simulated failure'),
    });
  });

  it('stops before installing when checkout verification does not match FETCH_HEAD', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [
      success(INITIAL_HEAD),
      success(INITIAL_HEAD),
    ]);
    const runner = createRunner(script);

    const result = bootstrapCodexWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(result).toMatchObject({ continue: false });
    expect(result.systemMessage).toContain('checkout verification failed');
    expect(commandNames(runner.calls)).not.toContain(
      'pnpm install --frozen-lockfile --prefer-offline'
    );
  });
});
