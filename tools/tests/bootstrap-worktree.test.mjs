import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapWorktree,
  readHookCwd,
  reportFailure,
  reportOutcome,
  reportWarning,
} from '../bootstrap-worktree.mjs';
import { createTempRepo } from '../git-housekeeping/tests/fixtures/temp-repo.mjs';

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

const BRANCH = 'claude/worktree-example';
const UNWORKED_BRANCH_CHECKS = [
  'git rev-parse --path-format=absolute --git-dir',
  'git rev-parse --path-format=absolute --git-common-dir',
  'git rev-parse --show-toplevel',
  'git rev-parse --abbrev-ref HEAD',
  'git status --porcelain --untracked-files=normal',
  `git for-each-ref --format=%(upstream) refs/heads/${BRANCH}`,
  `git rev-parse --verify --quiet refs/remotes/origin/${BRANCH}`,
  `git reflog show --format=%gs refs/heads/${BRANCH}`,
  'git merge-base --is-ancestor HEAD refs/remotes/origin/main',
];
const FAST_FORWARD = [
  'git rev-parse HEAD',
  'git fetch --no-tags origin main',
  'git rev-parse FETCH_HEAD',
  `git merge --ff-only ${FETCHED_HEAD}`,
  'git rev-parse HEAD',
];

// The shape every Claude Code worktree arrives in: its own branch, cut from origin/main as the
// shared repository last fetched it, with nothing committed, changed, or pushed.
function unworkedBranchScript() {
  const script = defaultScript();
  script.set(commandKey('git', ['rev-parse', '--abbrev-ref', 'HEAD']), [success(BRANCH)]);
  script.set(commandKey('git', ['status', '--porcelain', '--untracked-files=normal']), [success()]);
  script.set(commandKey('git', ['for-each-ref', '--format=%(upstream)', `refs/heads/${BRANCH}`]), [
    success(),
  ]);
  script.set(
    commandKey('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`]),
    [failure('')]
  );
  script.set(commandKey('git', ['reflog', 'show', '--format=%gs', `refs/heads/${BRANCH}`]), [
    success('branch: Created from origin/main'),
  ]);
  script.set(
    commandKey('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']),
    [success()]
  );
  script.set(commandKey('git', ['merge', '--ff-only', FETCHED_HEAD]), [success()]);
  return script;
}

function runBootstrap(script) {
  const runner = createRunner(script);
  const warnings = [];
  const failed = bootstrapWorktree({
    cwd: SESSION_CWD,
    runCommand: runner.runCommand,
    onWarning: (warning) => warnings.push(warning),
  });
  return { failed, warnings, commands: commandNames(runner.calls) };
}

describe('worktree bootstrap on a named branch', () => {
  it('fast-forwards an unworked branch to the fetched origin/main before installing', () => {
    const { failed, warnings, commands } = runBootstrap(unworkedBranchScript());

    expect(failed).toBeNull();
    expect(warnings).toEqual([]);
    expect(commands).toEqual([...UNWORKED_BRANCH_CHECKS, ...FAST_FORWARD, ...PROVISIONING]);
  });

  it.each([
    {
      name: 'a tracked change',
      command: ['git', 'status', '--porcelain', '--untracked-files=normal'],
      result: success(' M tracked.txt'),
      checksRun: 5,
    },
    {
      name: 'an untracked file',
      command: ['git', 'status', '--porcelain', '--untracked-files=normal'],
      result: success('?? notes.md'),
      checksRun: 5,
    },
    {
      name: 'an upstream',
      command: ['git', 'for-each-ref', '--format=%(upstream)', `refs/heads/${BRANCH}`],
      result: success(`refs/remotes/origin/${BRANCH}`),
      checksRun: 6,
    },
    {
      name: 'a pushed remote branch',
      command: ['git', 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`],
      result: success(INITIAL_HEAD),
      checksRun: 7,
    },
    {
      name: 'a ref that moved after creation',
      command: ['git', 'reflog', 'show', '--format=%gs', `refs/heads/${BRANCH}`],
      result: success('commit: real work\nbranch: Created from origin/main'),
      checksRun: 8,
    },
    {
      name: 'commits of its own',
      command: ['git', 'merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'],
      result: { status: 1, stdout: '', stderr: '' },
      checksRun: 9,
    },
  ])(
    'provisions without fetching or moving a branch with $name',
    ({ command, result, checksRun }) => {
      const script = unworkedBranchScript();
      script.set(commandKey(command[0], command.slice(1)), [result]);

      const { failed, warnings, commands } = runBootstrap(script);

      expect(failed).toBeNull();
      expect(warnings).toEqual([]);
      expect(commands).toEqual([...UNWORKED_BRANCH_CHECKS.slice(0, checksRun), ...PROVISIONING]);
    }
  );

  it('leaves a branch already at the fetched origin/main where it is', () => {
    const script = unworkedBranchScript();
    script.set(commandKey('git', ['rev-parse', 'FETCH_HEAD']), [success(INITIAL_HEAD)]);

    const { failed, warnings, commands } = runBootstrap(script);

    expect(failed).toBeNull();
    expect(warnings).toEqual([]);
    expect(commands).toEqual([
      ...UNWORKED_BRANCH_CHECKS,
      ...FAST_FORWARD.slice(0, 3),
      ...PROVISIONING,
    ]);
  });

  it.each([
    {
      name: 'fetch',
      command: ['git', 'fetch', '--no-tags', 'origin', 'main'],
      result: failure('simulated failure'),
      message: 'Could not fetch origin/main',
      commandsRun: 2,
    },
    {
      name: 'fast-forward',
      command: ['git', 'merge', '--ff-only', FETCHED_HEAD],
      result: failure('simulated failure'),
      message: 'Could not fast-forward the branch',
      commandsRun: 4,
    },
    {
      name: 'remote branch lookup',
      command: ['git', 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`],
      result: { status: 128, stdout: '', stderr: 'simulated failure' },
      message: 'Could not look up origin/',
      checksRun: 7,
      commandsRun: 0,
    },
    {
      name: 'ancestry check',
      command: ['git', 'merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'],
      result: { status: 128, stdout: '', stderr: 'simulated failure' },
      message: 'Could not compare HEAD',
      commandsRun: 0,
    },
  ])(
    'warns and still provisions when the $name fails',
    ({ command, result, message, checksRun = UNWORKED_BRANCH_CHECKS.length, commandsRun }) => {
      const script = unworkedBranchScript();
      script.set(commandKey(command[0], command.slice(1)), [result]);

      const { failed, warnings, commands } = runBootstrap(script);

      expect(failed).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(message);
      expect(warnings[0]).toContain('simulated failure');
      expect(warnings[0]).toContain('git merge --ff-only origin/main');
      expect(commands).toEqual([
        ...UNWORKED_BRANCH_CHECKS.slice(0, checksRun),
        ...FAST_FORWARD.slice(0, commandsRun),
        ...PROVISIONING,
      ]);
    }
  );

  it('warns when HEAD does not land on the fetched commit', () => {
    const script = unworkedBranchScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [
      success(INITIAL_HEAD),
      success(INITIAL_HEAD),
    ]);

    const { failed, warnings, commands } = runBootstrap(script);

    expect(failed).toBeNull();
    expect(warnings).toEqual([expect.stringContaining('fast-forward verification failed')]);
    expect(commands.slice(-4)).toEqual(PROVISIONING);
  });

  // A rival agent reviews in a worktree detached at the PR head. Only the detached-at-local-main
  // shape is refreshed, so that worktree is provisioned and never moved.
  it('never moves a worktree detached at a commit other than local main', () => {
    const script = defaultScript();
    script.set(commandKey('git', ['rev-parse', 'HEAD']), [success(INITIAL_HEAD)]);
    script.set(commandKey('git', ['rev-parse', 'refs/heads/main']), [success(FETCHED_HEAD)]);

    const { failed, warnings, commands } = runBootstrap(script);

    expect(failed).toBeNull();
    expect(warnings).toEqual([]);
    expect(commands).not.toContain('git fetch --no-tags origin main');
    expect(commands.slice(-4)).toEqual(PROVISIONING);
  });
});

describe('worktree bootstrap against a real repository', () => {
  const fixtures = [];
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.cleanup();
  });

  // The primary checkout's origin/main is left one merge behind the remote, the state a Claude
  // Code worktree was cut from on 2026-09-25.
  function createStaleWorktree({ track = false } = {}) {
    const fixture = createTempRepo();
    fixtures.push(fixture);
    const staleMain = fixture.sh(['rev-parse', 'HEAD']);
    const elsewhere = join(fixture.root, 'elsewhere');
    fixture.sh(['clone', '-q', fixture.origin, elsewhere], { cwd: fixture.root });
    const freshMain = fixture.commit('merged.txt', 'merged\n', 'merged elsewhere', {
      cwd: elsewhere,
    });
    fixture.sh(['push', '-q', 'origin', 'main'], { cwd: elsewhere });
    const worktree = join(fixture.root, 'worktree');
    fixture.sh([
      'worktree',
      'add',
      '-q',
      track ? '--track' : '--no-track',
      '-b',
      BRANCH,
      worktree,
      'origin/main',
    ]);
    const runCommand = (command, args, cwd) =>
      command === 'git'
        ? spawnSync('git', args, { cwd, encoding: 'utf8', env: fixture.env })
        : success();
    const bootstrap = () => {
      const warnings = [];
      const failed = bootstrapWorktree({
        cwd: worktree,
        runCommand,
        onWarning: (warning) => warnings.push(warning),
      });
      return { failed, warnings };
    };
    const head = () => fixture.sh(['rev-parse', 'HEAD'], { cwd: worktree });
    return { ...fixture, staleMain, freshMain, worktree, bootstrap, head };
  }

  it('fast-forwards a fresh branch without touching local main or the primary checkout', () => {
    const repo = createStaleWorktree();

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(repo.freshMain);
    expect(repo.sh(['rev-parse', 'refs/heads/main'])).toBe(repo.staleMain);
    expect(repo.sh(['status', '--porcelain'])).toBe('');
    expect(repo.sh(['rev-parse', 'refs/remotes/origin/main'])).toBe(repo.freshMain);
  });

  it('leaves a branch with a commit of its own in place', () => {
    const repo = createStaleWorktree();
    const ownCommit = repo.commit('work.txt', 'work\n', 'real work', { cwd: repo.worktree });

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(ownCommit);
  });

  // Ancestry alone cannot tell a fresh branch from one whose commit reached main and was
  // reverted there: HEAD is an ancestor of origin/main either way.
  it('leaves a branch whose commit was merged to main and reverted in place', () => {
    const repo = createStaleWorktree();
    const ownCommit = repo.commit('work.txt', 'work\n', 'real work', { cwd: repo.worktree });
    repo.sh(['merge', '-q', '--ff-only', ownCommit]);
    repo.sh(['revert', '--no-edit', 'HEAD']);
    repo.sh(['push', '-q', '--force', 'origin', 'main']);

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(ownCommit);
  });

  it('fast-forwards a fresh branch that was renamed after creation', () => {
    const repo = createStaleWorktree();
    repo.sh(['branch', '-m', BRANCH, 'claude/renamed'], { cwd: repo.worktree });

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(repo.freshMain);
  });

  it('leaves a branch with an untracked file in place', () => {
    const repo = createStaleWorktree();
    writeFileSync(join(repo.worktree, 'notes.md'), 'draft\n');

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(repo.staleMain);
  });

  it('leaves a branch tracking an upstream in place', () => {
    const repo = createStaleWorktree({ track: true });

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(repo.staleMain);
  });

  it('leaves a branch pushed without an upstream in place', () => {
    const repo = createStaleWorktree();
    repo.sh(['push', '-q', 'origin', BRANCH], { cwd: repo.worktree });

    expect(repo.bootstrap()).toEqual({ failed: null, warnings: [] });
    expect(repo.head()).toBe(repo.staleMain);
  });

  it('warns and leaves the branch in place when the fetch fails', () => {
    const repo = createStaleWorktree();
    repo.sh(['remote', 'set-url', 'origin', join(repo.root, 'missing.git')]);

    const { failed, warnings } = repo.bootstrap();

    expect(failed).toBeNull();
    expect(warnings).toEqual([expect.stringContaining('Could not fetch origin/main')]);
    expect(repo.head()).toBe(repo.staleMain);
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

  // Claude Code splits the audiences: systemMessage reaches only the user, and only
  // hookSpecificOutput.additionalContext reaches the model. Losing the second field is silent —
  // the session still starts and nothing reports an error — so it is pinned here by name.
  it('hands Claude the failure on both the user and the model channel', () => {
    const report = reportFailure('claude', 'boom');

    expect(report.stdout.systemMessage).toContain('Splotch worktree bootstrap stopped');
    expect(report.stdout.hookSpecificOutput).toMatchObject({
      hookEventName: 'SessionStart',
      additionalContext: expect.stringContaining('boom'),
    });
    expect(report.stdout.hookSpecificOutput.additionalContext).toContain(
      'pnpm install --frozen-lockfile'
    );
    expect(report.stdout.continue).toBeUndefined();
  });

  // SessionStart cannot block on any exit code, and a schema-valid body makes Claude Code ignore
  // the exit code rather than report an error, so a non-zero exit would buy nothing and mislead.
  it('exits zero for Claude so the structured body is the whole contract', () => {
    expect(reportFailure('claude', 'boom').exitCode).toBe(0);
  });

  // A stale start is recoverable in-session, so a refresh warning must never carry Codex's
  // `continue: false` — that would stop a session over a branch that is merely behind.
  it('hands both runners a refresh warning without stopping the session', () => {
    const report = reportWarning('behind');

    expect(report.stdout.continue).toBeUndefined();
    expect(report.stdout.systemMessage).toContain('behind');
    expect(report.stdout.hookSpecificOutput).toEqual({
      hookEventName: 'SessionStart',
      additionalContext: expect.stringContaining('behind'),
    });
    expect(report.exitCode).toBe(0);
  });

  it.each(['claude', 'codex'])('reports nothing for %s when the bootstrap is clean', (runner) => {
    expect(reportOutcome(runner, { failure: null, warning: null })).toBeNull();
  });

  it.each(['claude', 'codex'])('reports a lone refresh warning to %s as a warning', (runner) => {
    expect(reportOutcome(runner, { failure: null, warning: 'behind' })).toEqual(
      reportWarning('behind')
    );
  });

  it('keeps the refresh warning when a later step stops the bootstrap', () => {
    const report = reportOutcome('codex', { failure: 'install failed', warning: 'behind' });

    expect(report.stdout.continue).toBe(false);
    expect(report.stdout.stopReason).toContain('install failed');
    expect(report.stdout.stopReason).toContain('behind');
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

  it('prints a Claude SessionStart body when it cannot inspect Git', () => {
    const result = run(['--runner=claude'], '');

    expect(result.status).toBe(0);
    const stdout = JSON.parse(result.stdout);
    expect(stdout.systemMessage).toContain('Splotch worktree bootstrap stopped');
    expect(stdout.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(stdout.hookSpecificOutput.additionalContext).toContain(
      'Could not inspect the Git directory'
    );
  });

  // The payload directory has to beat the process directory, or a Claude Code hook would provision
  // the main checkout it was launched from instead of the worktree it was told about.
  it('prefers the payload directory over the process directory', () => {
    const result = spawnSync(process.execPath, [scriptPath, '--runner=claude'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: JSON.stringify({ cwd: tmpdir() }),
    });

    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain(
      'Could not inspect the Git directory'
    );
  });
});
