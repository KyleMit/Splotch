import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  assertPatchPreserved,
  lowerPullRequests,
  pushRebasedStack,
} from '../push-rebased-stack.mjs';

// The pre-push hook that used to prove a rebase preserved every lower PR's patch
// was removed (it refused every push it could not check with `gh`, which meant
// every push from a cloud session). This wrapper carries that proof instead, so
// these tests are what keeps the guarantee real rather than aspirational: the
// interesting case is a rebase that rewrites a reviewed PR's CONTENT, which git
// reports as success and which no other check in the repo would notice.
const SHA = {
  base: '1111111111111111111111111111111111111111',
  lowerOld: '2222222222222222222222222222222222222222',
  lowerNew: '3333333333333333333333333333333333333333',
  tip: '4444444444444444444444444444444444444444',
  rebasedBase: '5555555555555555555555555555555555555555',
};

const pullRequests = [
  {
    number: 1512,
    headRefName: 'campaign/lower',
    headRefOid: SHA.lowerOld,
    baseRefName: 'main',
    baseRefOid: SHA.base,
    url: 'https://github.com/KyleMit/Splotch/pull/1512',
  },
  {
    number: 1513,
    headRefName: 'campaign/tip',
    headRefOid: SHA.tip,
    baseRefName: 'campaign/lower',
    baseRefOid: SHA.lowerOld,
    url: 'https://github.com/KyleMit/Splotch/pull/1513',
  },
];

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

// Fakes the plumbing `patchId` drives: `git diff` writes a file whose bytes stand
// in for the range's content, and `git patch-id` hashes those bytes back. Two
// ranges therefore compare equal exactly when the fake gave them the same
// content, which is what lets a test state "the rebase changed this PR".
// Stand-in content is single-token on purpose: real `git patch-id` prints
// "<id> <commit>" and the parser keeps the first token, so a multi-word fake
// would collapse two different ranges onto the same id and pass by accident.
function createRunner({
  contentByRange = {},
  localHeads = {},
  calls = [],
  ghStackStatus = 0,
} = {}) {
  return (command, args, options = {}) => {
    calls.push(`${command} ${args.join(' ')}`);
    if (command === 'git' && args[0] === 'rev-parse') {
      const ref = args.at(-1).replace('^{commit}', '');
      const sha = localHeads[ref];
      return sha ? result(0, sha) : result(1, '', 'unknown revision');
    }
    if (command === 'git' && args[0] === 'fetch') return result(0);
    if (command === 'git' && args[0] === 'diff') {
      const range = args.find((arg) => arg.includes('...'));
      const output = args.find((arg) => arg.startsWith('--output=')).slice('--output='.length);
      writeFileSync(output, contentByRange[range] ?? `content-of-${range}`);
      return result(0);
    }
    if (command === 'git' && args[0] === 'patch-id') {
      return result(0, `patch-${readFileSync(options.stdio[0], 'utf8')}`);
    }
    if (command === 'gh' && args[0] === 'stack') return result(ghStackStatus);
    if (command === 'gh') return result(0, JSON.stringify(pullRequests));
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
}

describe('lowerPullRequests', () => {
  it('selects the PRs another open PR is based on', () => {
    expect(lowerPullRequests(pullRequests).map(({ number }) => number)).toEqual([1512]);
  });

  it('excludes the tip, where new commits legitimately land', () => {
    expect(lowerPullRequests(pullRequests).map(({ headRefName }) => headRefName)).not.toContain(
      'campaign/tip'
    );
  });

  it('selects nothing when no PR is stacked on another', () => {
    expect(lowerPullRequests([pullRequests[1]])).toEqual([]);
  });
});

describe('assertPatchPreserved', () => {
  const pullRequest = pullRequests[0];

  it('passes a rebase that rewrote the commit but kept the patch', () => {
    const runCommand = createRunner({
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/heads/main': SHA.rebasedBase,
      },
      contentByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'reviewed-change',
        [`${SHA.rebasedBase}...${SHA.lowerNew}`]: 'reviewed-change',
      },
    });
    expect(assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toBe(
      'preserved'
    );
  });

  it('refuses a rebase that changed the PR content, naming the PR', () => {
    const runCommand = createRunner({
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/heads/main': SHA.rebasedBase,
      },
      contentByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'reviewed-change',
        [`${SHA.rebasedBase}...${SHA.lowerNew}`]: 'reviewed-change-plus-a-quiet-edit',
      },
    });
    expect(() => assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toThrow(
      /PR #1512 \(campaign\/lower\)/
    );
  });

  it('skips a branch this checkout does not have', () => {
    const runCommand = createRunner({ localHeads: {} });
    expect(assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toBe('skipped');
  });

  it('skips a branch the rebase left alone', () => {
    const runCommand = createRunner({
      localHeads: { 'refs/heads/campaign/lower': SHA.lowerOld },
    });
    expect(assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toBe(
      'unchanged'
    );
  });

  it('falls back to the remote base when the rebase did not move it locally', () => {
    const calls = [];
    const runCommand = createRunner({
      calls,
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/remotes/origin/main': SHA.base,
      },
      contentByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'reviewed-change',
        [`${SHA.base}...${SHA.lowerNew}`]: 'reviewed-change',
      },
    });
    expect(assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toBe(
      'preserved'
    );
    expect(calls).toContain('git rev-parse --verify --quiet refs/remotes/origin/main^{commit}');
  });
});

describe('pushRebasedStack', () => {
  it('pushes once every lower PR keeps its patch', () => {
    const calls = [];
    const runCommand = createRunner({
      calls,
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/heads/main': SHA.rebasedBase,
      },
      contentByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'same',
        [`${SHA.rebasedBase}...${SHA.lowerNew}`]: 'same',
      },
    });
    pushRebasedStack({ args: [], runCommand });
    expect(calls).toContain('gh stack push');
  });

  it('does not push when a lower PR patch changed', () => {
    const calls = [];
    const runCommand = createRunner({
      calls,
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/heads/main': SHA.rebasedBase,
      },
      contentByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'reviewed',
        [`${SHA.rebasedBase}...${SHA.lowerNew}`]: 'rewritten',
      },
    });
    expect(() => pushRebasedStack({ args: [], runCommand })).toThrow(/PR #1512/);
    expect(calls).not.toContain('gh stack push');
  });

  it('fetches the pre-rebase commits before comparing', () => {
    const calls = [];
    const runCommand = createRunner({
      calls,
      localHeads: { 'refs/heads/campaign/lower': SHA.lowerOld },
    });
    pushRebasedStack({ args: [], runCommand });
    expect(calls.indexOf('git fetch origin')).toBeLessThan(calls.indexOf('gh stack push'));
  });

  it('surfaces a failing gh stack push', () => {
    const runCommand = createRunner({
      localHeads: { 'refs/heads/campaign/lower': SHA.lowerOld },
      ghStackStatus: 1,
    });
    expect(() => pushRebasedStack({ args: [], runCommand })).toThrow(/gh stack push exited 1/);
  });

  it('forwards extra arguments to gh stack push', () => {
    const calls = [];
    const runCommand = createRunner({
      calls,
      localHeads: { 'refs/heads/campaign/lower': SHA.lowerOld },
    });
    pushRebasedStack({ args: ['--dry-run'], runCommand });
    expect(calls).toContain('gh stack push --dry-run');
  });
});
