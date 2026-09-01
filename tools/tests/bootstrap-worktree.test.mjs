import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapWorktree, readHookCwd, reportFailure } from '../bootstrap-worktree.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const scriptPath = join(repoRoot, 'tools', 'bootstrap-worktree.mjs');
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

const PROVISIONING = [
  'corepack enable pnpm',
  'corepack install',
  'pnpm install --frozen-lockfile --prefer-offline',
  'npm run info',
];

describe('worktree bootstrap hook registration', () => {
  it('registers one synchronous startup-only Codex hook through the repository root', () => {
    const config = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8'));
    const group = config.hooks.SessionStart[0];
    const hook = group.hooks[0];

    expect(group.matcher).toBe('^startup$');
    expect(hook.type).toBe('command');
    expect(hook.command).toBe(
      'node "$(git rev-parse --show-toplevel)/tools/bootstrap-worktree.mjs" --runner=codex'
    );
    expect(hook.async).toBeUndefined();
  });

  // CLAUDE_PROJECT_DIR stays on the main checkout when Claude Code enters a worktree, so the hook
  // command can only ever name the main checkout's copy of the script; the worktree it must
  // provision arrives in the payload instead.
  it('registers a startup-only Claude hook through the project directory', () => {
    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
    const group = settings.hooks.SessionStart.find(({ matcher }) => matcher === 'startup');
    const hook = group.hooks[0];

    expect(hook.type).toBe('command');
    expect(hook.command).toBe(
      'node "$CLAUDE_PROJECT_DIR/tools/bootstrap-worktree.mjs" --runner=claude'
    );
    expect(hook.timeout).toBeGreaterThanOrEqual(600);
  });
});

describe('worktree bootstrap', () => {
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

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
    ]);
  });

  it('updates a stale main worktree before installing and verifying dependencies', () => {
    const runner = createRunner();

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
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
      ...PROVISIONING,
    ]);
    expect(runner.calls.slice(0, 3).map(({ cwd }) => cwd)).toEqual([
      SESSION_CWD,
      SESSION_CWD,
      SESSION_CWD,
    ]);
    expect(runner.calls.slice(3).every(({ cwd }) => cwd === WORKTREE_ROOT)).toBe(true);
  });

  it('retries provisioning after checkout has already moved HEAD beyond local main', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [success(FETCHED_HEAD)]);
    const runner = createRunner(script);

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
      'git rev-parse --show-toplevel',
      'git rev-parse --abbrev-ref HEAD',
      'git rev-parse HEAD',
      'git rev-parse refs/heads/main',
      ...PROVISIONING,
    ]);
  });

  it('provisions without moving HEAD when the local main ref does not exist', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'refs/heads/main']), [failure('unknown revision')]);
    const runner = createRunner(script);

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
      'git rev-parse --show-toplevel',
      'git rev-parse --abbrev-ref HEAD',
      'git rev-parse HEAD',
      'git rev-parse refs/heads/main',
      ...PROVISIONING,
    ]);
  });

  // The shape every Claude Code worktree arrives in: its own branch, already cut from the remote
  // default. Nothing about HEAD may move, but the checkout still has no node_modules.
  it('provisions an attached linked worktree without touching HEAD', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', '--abbrev-ref', 'HEAD']), [
      success('claude/worktree-example'),
    ]);
    const runner = createRunner(script);

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls)).toEqual([
      'git rev-parse --path-format=absolute --git-dir',
      'git rev-parse --path-format=absolute --git-common-dir',
      'git rev-parse --show-toplevel',
      'git rev-parse --abbrev-ref HEAD',
      ...PROVISIONING,
    ]);
  });

  it('stops before fetching when tracked changes are present', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['status', '--porcelain', '--untracked-files=no']), [
      success(' M tracked.txt'),
    ]);
    const runner = createRunner(script);

    const reason = bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(reason).toContain('tracked changes are present');
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
      name: 'pnpm provisioning',
      command: ['corepack', 'install'],
      message: 'Could not provision the pinned pnpm version',
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
  ])('returns the failure reason on $name failure', ({ command, message }) => {
    const script = defaultScript();
    script.set(commandKey(command[0], command.slice(1)), [failure('simulated failure')]);
    const runner = createRunner(script);

    const reason = bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(reason).toContain(message);
    expect(reason).toContain('simulated failure');
  });

  it('continues when Corepack cannot enable its pnpm shim', () => {
    const script = defaultScript();
    script.set(commandKey('corepack', ['enable', 'pnpm']), [failure('read-only Node bin')]);
    const runner = createRunner(script);

    expect(bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand })).toBeNull();
    expect(commandNames(runner.calls).slice(-4)).toEqual(PROVISIONING);
  });

  it('stops before installing when checkout verification does not match FETCH_HEAD', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [
      success(INITIAL_HEAD),
      success(INITIAL_HEAD),
    ]);
    const runner = createRunner(script);

    const reason = bootstrapWorktree({ cwd: SESSION_CWD, runCommand: runner.runCommand });

    expect(reason).toContain('checkout verification failed');
    expect(commandNames(runner.calls)).not.toContain(
      'pnpm install --frozen-lockfile --prefer-offline'
    );
  });
});

describe('hook payload handling', () => {
  it('reads the worktree root out of a hook payload', () => {
    expect(readHookCwd(JSON.stringify({ cwd: WORKTREE_ROOT }))).toBe(WORKTREE_ROOT);
  });

  it.each([
    { name: 'no payload', payload: '' },
    { name: 'unparseable payload', payload: 'not json' },
    { name: 'payload without a cwd', payload: '{"session_id":"abc"}' },
    { name: 'payload with an empty cwd', payload: '{"cwd":""}' },
    { name: 'payload with a non-string cwd', payload: '{"cwd":42}' },
  ])('falls back to the process directory for $name', ({ payload }) => {
    expect(readHookCwd(payload)).toBeNull();
  });
});

describe('runner-specific failure reporting', () => {
  it('hands Codex a stop decision on stdout and a zero exit', () => {
    expect(reportFailure('codex', 'boom')).toEqual({
      stdout: {
        continue: false,
        stopReason: expect.stringContaining('boom'),
        systemMessage: expect.stringContaining('Splotch worktree bootstrap stopped'),
      },
      exitCode: 0,
    });
  });

  // A non-zero exit is Claude Code's non-blocking error: the notice reaches the user, the
  // systemMessage reaches Claude, and the session still starts so the fix can happen in place.
  it('hands Claude a non-blocking error the session survives', () => {
    const report = reportFailure('claude', 'boom');

    expect(report.exitCode).not.toBe(0);
    expect(report.stderr).toContain('boom');
    expect(report.stdout.systemMessage).toContain('Splotch worktree bootstrap stopped');
    expect(report.stdout.continue).toBeUndefined();
  });
});

describe('worktree bootstrap executable', () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [scriptPath, ...args], { cwd: '/tmp', encoding: 'utf8', input });

  it('refuses to run without a known runner', () => {
    const result = run([]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--runner must be one of');
  });

  it('prints a Codex stop decision when it cannot inspect Git', () => {
    const result = run(['--runner=codex'], '');

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      continue: false,
      stopReason: expect.stringContaining('Could not inspect the Git directory'),
      systemMessage: expect.stringContaining('Splotch worktree bootstrap stopped'),
    });
  });

  it('exits non-zero for Claude when it cannot inspect Git', () => {
    const result = run(['--runner=claude'], '');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Could not inspect the Git directory');
    expect(JSON.parse(result.stdout).systemMessage).toContain('Splotch worktree bootstrap stopped');
  });

  // The payload directory has to beat the process directory, or a Claude Code hook would provision
  // the main checkout it was launched from instead of the worktree it was told about.
  it('prefers the payload directory over the process directory', () => {
    const result = spawnSync(process.execPath, [scriptPath, '--runner=claude'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: JSON.stringify({ cwd: tmpdir() }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Could not inspect the Git directory');
  });
});
