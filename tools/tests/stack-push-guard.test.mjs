import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { guardStackPush, lowerStackUpdates, parsePushUpdates } from '../guard-stack-push.mjs';
import { installStackPushGuard } from '../install-stack-push-guard.mjs';
import { pushRebasedStack } from '../push-rebased-stack.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const SHA = {
  main: '1111111111111111111111111111111111111111',
  lowerBase: '2222222222222222222222222222222222222222',
  lowerOld: '3333333333333333333333333333333333333333',
  lowerNew: '4444444444444444444444444444444444444444',
  child: '5555555555555555555555555555555555555555',
};

const pullRequests = [
  {
    number: 1512,
    headRefName: 'campaign/lower',
    headRefOid: SHA.lowerOld,
    baseRefName: 'campaign/base',
    baseRefOid: SHA.lowerBase,
    url: 'https://github.com/KyleMit/Splotch/pull/1512',
  },
  {
    number: 1513,
    headRefName: 'campaign/child',
    headRefOid: SHA.child,
    baseRefName: 'campaign/lower',
    baseRefOid: SHA.lowerOld,
    url: 'https://github.com/KyleMit/Splotch/pull/1513',
  },
];

function pushLine(branch, localSha = SHA.lowerNew, remoteSha = SHA.lowerOld) {
  return `refs/heads/${branch} ${localSha} refs/heads/${branch} ${remoteSha}\n`;
}

function pushRefLine(localRef, remoteBranch, localSha = SHA.lowerNew, remoteSha = SHA.lowerOld) {
  return `${localRef} ${localSha} refs/heads/${remoteBranch} ${remoteSha}\n`;
}

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

function createGuardRunner({ proposedPatchId = 'same-patch' } = {}) {
  return (command, args, options = {}) => {
    if (command === 'gh') return result(0, JSON.stringify(pullRequests));
    if (command === 'git' && args[0] === 'rev-parse') return result(0, SHA.lowerBase);
    if (command === 'git' && args[0] === 'diff') {
      const diffPath = args.find((arg) => arg.startsWith('--output=')).slice('--output='.length);
      const isOriginal = args.includes(`${SHA.lowerBase}...${SHA.lowerOld}`);
      writeFileSync(diffPath, isOriginal ? 'original diff' : 'proposed diff');
      return result(0);
    }
    if (command === 'git' && args[0] === 'patch-id') {
      const diff = readFileSync(options.stdio[0], 'utf8');
      return result(0, `${diff === 'original diff' ? 'same-patch' : proposedPatchId} 0\n`);
    }
    return result(1, '', `Unexpected command: ${command} ${args.join(' ')}`);
  };
}

function withSnapshot(run) {
  const directory = mkdtempSync(join(tmpdir(), 'stack-push-guard-test-'));
  const path = join(directory, 'snapshot.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, pullRequests }));
  try {
    return run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('stacked PR push guard', () => {
  it('parses the Git pre-push protocol and identifies only branches with open children', () => {
    const updates = parsePushUpdates(
      `${pushLine('campaign/lower')}${pushLine('campaign/child', SHA.child, SHA.lowerOld)}`
    );

    expect(lowerStackUpdates(updates, pullRequests)).toMatchObject([
      { branch: 'campaign/lower', childPrs: [{ number: 1513 }] },
    ]);
  });

  it('blocks the campaign failure mode: a content push to a PR below another open PR', () => {
    expect(() =>
      guardStackPush({
        input: pushLine('campaign/lower'),
        remoteName: 'origin',
        remoteUrl: 'git@github.com:KyleMit/Splotch.git',
        env: {},
        runCommand: createGuardRunner(),
      })
    ).toThrow(/Blocked push to a non-tip stacked PR.*campaign\/child/);
  });

  it('keys enforcement to the destination of an asymmetric refspec', () => {
    expect(() =>
      guardStackPush({
        input: pushRefLine('HEAD', 'campaign/lower'),
        remoteName: 'origin',
        remoteUrl: 'git@github.com:KyleMit/Splotch.git',
        env: {},
        runCommand: createGuardRunner(),
      })
    ).toThrow(/Blocked push to a non-tip stacked PR/);
  });

  it('allows ordinary pushes to the stack tip', () => {
    expect(() =>
      guardStackPush({
        input: pushLine('campaign/child', SHA.child),
        remoteName: 'origin',
        remoteUrl: 'git@github.com:KyleMit/Splotch.git',
        env: {},
        runCommand: createGuardRunner(),
      })
    ).not.toThrow();
  });

  it('does not classify a long-lived base branch as a stack member', () => {
    const directPullRequest = [
      {
        ...pullRequests[0],
        headRefName: 'feature/direct',
        baseRefName: 'main',
      },
    ];
    expect(
      lowerStackUpdates(parsePushUpdates(pushLine('main', SHA.main)), directPullRequest)
    ).toEqual([]);
  });

  it('allows an intentional rebase publication when the lower PR patch is unchanged', () => {
    withSnapshot((snapshotPath) => {
      expect(() =>
        guardStackPush({
          input: pushLine('campaign/lower'),
          remoteName: 'origin',
          remoteUrl: 'git@github.com:KyleMit/Splotch.git',
          env: { SPLOTCH_STACK_REBASE_SNAPSHOT: snapshotPath },
          runCommand: createGuardRunner(),
        })
      ).not.toThrow();
    });
  });

  it('allows the same lower-PR patch after its base branch advances', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stack-push-real-git-'));
    const git = (...args) => {
      const command = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      if (command.status !== 0) throw new Error(command.stderr);
      return command.stdout.trim();
    };
    try {
      git('init', '--quiet', '--initial-branch=campaign/base');
      git('config', 'user.email', 'stack-guard@example.test');
      git('config', 'user.name', 'Stack Guard Test');
      writeFileSync(join(directory, 'base.txt'), 'base\n');
      git('add', 'base.txt');
      git('commit', '--quiet', '-m', 'base');
      const originalBase = git('rev-parse', 'HEAD');

      git('checkout', '--quiet', '-b', 'campaign/lower');
      writeFileSync(join(directory, 'feature.txt'), 'feature\n');
      git('add', 'feature.txt');
      git('commit', '--quiet', '-m', 'feature');
      const originalHead = git('rev-parse', 'HEAD');

      git('checkout', '--quiet', 'campaign/base');
      writeFileSync(join(directory, 'base.txt'), 'base\nadvanced\n');
      git('commit', '--quiet', '-am', 'advance base');
      const advancedBase = git('rev-parse', 'HEAD');

      git('checkout', '--quiet', '-b', 'campaign/rebased-lower', advancedBase);
      git('cherry-pick', '--quiet', originalHead);
      const rebasedHead = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/remotes/origin/campaign/base', advancedBase);

      const livePullRequests = [
        {
          number: 1512,
          headRefName: 'campaign/lower',
          headRefOid: originalHead,
          baseRefName: 'campaign/base',
          baseRefOid: advancedBase,
        },
        {
          number: 1513,
          headRefName: 'campaign/child',
          headRefOid: SHA.child,
          baseRefName: 'campaign/lower',
          baseRefOid: originalHead,
        },
      ];

      withSnapshot((snapshotPath) => {
        writeFileSync(
          snapshotPath,
          JSON.stringify({ schemaVersion: 1, pullRequests: livePullRequests })
        );
        const runCommand = (command, args, options = {}) => {
          if (command === 'gh') return result(0, JSON.stringify(livePullRequests));
          return spawnSync(command, args, { cwd: directory, encoding: 'utf8', ...options });
        };
        expect(() =>
          guardStackPush({
            input: pushLine('campaign/lower', rebasedHead, originalHead),
            remoteName: 'origin',
            remoteUrl: 'git@github.com:KyleMit/Splotch.git',
            env: { SPLOTCH_STACK_REBASE_SNAPSHOT: snapshotPath },
            runCommand,
          })
        ).not.toThrow();
      });

      expect(git('merge-base', advancedBase, rebasedHead)).toBe(advancedBase);
      expect(git('merge-base', advancedBase, originalHead)).toBe(originalBase);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('blocks a lower-PR content change even through the intentional rebase wrapper', () => {
    withSnapshot((snapshotPath) => {
      expect(() =>
        guardStackPush({
          input: pushLine('campaign/lower'),
          remoteName: 'origin',
          remoteUrl: 'git@github.com:KyleMit/Splotch.git',
          env: { SPLOTCH_STACK_REBASE_SNAPSHOT: snapshotPath },
          runCommand: createGuardRunner({ proposedPatchId: 'changed-patch' }),
        })
      ).toThrow(/Blocked a content change to lower PR #1512/);
    });
  });

  it('fails closed when the live PR graph cannot be read', () => {
    expect(() =>
      guardStackPush({
        input: pushLine('campaign/child', SHA.child),
        remoteUrl: 'git@github.com:KyleMit/Splotch.git',
        runCommand: () => result(1, '', 'offline'),
      })
    ).toThrow(/safety gate has no offline bypass: offline/);
  });
});

describe('stacked PR push guard installation', () => {
  it('installs the tracked hooks path without replacing an existing custom path', () => {
    const calls = [];
    const installRunner = (command, args) => {
      calls.push([command, ...args]);
      return args.includes('--get') ? result(1) : result(0);
    };

    expect(installStackPushGuard({ runCommand: installRunner })).toBe(true);
    expect(calls.at(-1)).toEqual(['git', 'config', '--local', 'core.hooksPath', '.githooks']);

    expect(() =>
      installStackPushGuard({
        runCommand: () => result(0, '/custom/hooks\n'),
      })
    ).toThrow(/refusing to replace an existing hook setup/);
  });

  it('is installed by both agent session configurations', () => {
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8'));
    const claude = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
    const installer = 'install-stack-push-guard.mjs';

    expect(
      codex.hooks.SessionStart[0].hooks.some(({ command }) => command.includes(installer))
    ).toBe(true);
    expect(
      claude.hooks.SessionStart[0].hooks.some(({ command }) => command.includes(installer))
    ).toBe(true);
    expect(statSync(join(repoRoot, '.githooks', 'pre-push')).mode & 0o111).not.toBe(0);
  });
});

describe('rebased stack push wrapper', () => {
  it('passes a temporary live-PR snapshot to gh stack push and removes it afterward', () => {
    let snapshotPath;
    pushRebasedStack({
      args: ['--remote', 'origin'],
      loadPullRequests: () => pullRequests,
      runCommand: (command, args, options) => {
        expect([command, ...args]).toEqual(['gh', 'stack', 'push', '--remote', 'origin']);
        snapshotPath = options.env.SPLOTCH_STACK_REBASE_SNAPSHOT;
        expect(JSON.parse(readFileSync(snapshotPath, 'utf8')).pullRequests).toEqual(pullRequests);
        return result(0);
      },
    });

    expect(existsSync(snapshotPath)).toBe(false);
  });
});
