import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  createTempRepo,
  REAL_REPO_TEST_OPTIONS,
} from '../git-housekeeping/tests/fixtures/temp-repo.mjs';
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

const NO_COMMIT = '0000000000000000000000000000000000000000';

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

// Fakes the plumbing `patchId` drives, for the orchestration tests: `git diff`
// writes the patch id the test assigned the range, and `git patch-id` prints it
// back as git prints an id read from a bare diff, `<id> <commit>`. Two ranges
// compare equal exactly when the test says so. Whether git would say so is the
// comparator's question, and the real-repository suite answers it. An assigned
// id is a single token, as git's are: the parser keeps the first token, so a
// multi-word id would collapse two ranges onto one id and pass by accident.
function createRunner({
  patchIdByRange = {},
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
      writeFileSync(output, patchIdByRange[range] ?? `patch-of-${range}`);
      return result(0);
    }
    if (command === 'git' && args[0] === 'patch-id') {
      return result(0, `${readFileSync(options.stdio[0], 'utf8')} ${NO_COMMIT}`);
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

  it('refuses a patch git cannot identify rather than comparing empty ids', () => {
    const fake = createRunner({
      localHeads: {
        'refs/heads/campaign/lower': SHA.lowerNew,
        'refs/heads/main': SHA.rebasedBase,
      },
    });
    const runCommand = (command, args, options) =>
      command === 'git' && args[0] === 'patch-id' ? result(0) : fake(command, args, options);
    expect(() => assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toThrow(
      `Could not identify the patch of ${SHA.base}...${SHA.lowerOld}`
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
      patchIdByRange: {
        [`${SHA.base}...${SHA.lowerOld}`]: 'reviewed-patch',
        [`${SHA.base}...${SHA.lowerNew}`]: 'reviewed-patch',
      },
    });
    expect(assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest })).toBe(
      'preserved'
    );
    expect(calls).toContain('git rev-parse --verify --quiet refs/remotes/origin/main^{commit}');
  });
});

describe('assertPatchPreserved against a real repository', REAL_REPO_TEST_OPTIONS, () => {
  const PR_FILE = 'stack.txt';
  const REVIEWED_EDIT = { 10: 'line 10 reviewed' };

  function numberedLines(replacements = {}) {
    const lines = Array.from(
      { length: 20 },
      (_, index) => replacements[index + 1] ?? `line ${index + 1}`
    );
    return `${lines.join('\n')}\n`;
  }

  // The lower PR as GitHub recorded it, then its branch rebased onto a main that
  // moved on and applied `mainEdit` to the PR's file. `rewrite` is amended into the
  // rebased commit when the rebase is meant to have changed the PR.
  function rebaseLowerPullRequest({ prEdit = REVIEWED_EDIT, mainEdit, rewrite } = {}) {
    const fixture = createTempRepo();
    onTestFinished(fixture.cleanup);
    const { headRefName } = pullRequests[0];
    const base = fixture.commit(PR_FILE, numberedLines(), 'base');
    fixture.sh(['checkout', '-q', '-b', headRefName]);
    const reviewedHead = fixture.commit(PR_FILE, numberedLines(prEdit), 'reviewed change');
    fixture.sh(['checkout', '-q', 'main']);
    fixture.commit('unrelated.txt', 'unrelated\n', 'main moves on');
    if (mainEdit) fixture.commit(PR_FILE, numberedLines(mainEdit), 'main edits the PR file');
    fixture.sh(['checkout', '-q', headRefName]);
    fixture.sh(['rebase', '-q', 'main']);
    if (rewrite) {
      writeFileSync(
        join(fixture.repo, PR_FILE),
        numberedLines({ ...mainEdit, ...prEdit, ...rewrite })
      );
      fixture.sh(['commit', '-q', '-a', '--amend', '--no-edit']);
    }
    const pullRequest = { ...pullRequests[0], headRefOid: reviewedHead, baseRefOid: base };
    const runCommand = (command, args, options = {}) =>
      spawnSync(command, args, {
        encoding: 'utf8',
        ...options,
        cwd: fixture.repo,
        env: fixture.env,
      });
    const assertPreserved = () =>
      assertPatchPreserved({ runCommand, remoteName: 'origin', pullRequest });
    return { ...fixture, assertPreserved };
  }

  it('passes a rebase that kept the reviewed patch', () => {
    expect(rebaseLowerPullRequest().assertPreserved()).toBe('preserved');
  });

  it('refuses a rebase that only re-indented the reviewed line, naming the PR', () => {
    const stack = rebaseLowerPullRequest({ rewrite: { 10: '  line 10 reviewed' } });
    expect(stack.assertPreserved).toThrow(/PR #1512 \(campaign\/lower\)/);
  });

  it('passes a rebase onto a main that edited a line beside the reviewed hunk', () => {
    const stack = rebaseLowerPullRequest({ mainEdit: { 8: 'line 8 on main' } });
    expect(stack.assertPreserved()).toBe('preserved');
  });

  it("leaves out the context lines the user's diff config adds", () => {
    const stack = rebaseLowerPullRequest({
      prEdit: { 8: 'line 8 reviewed', 12: 'line 12 reviewed' },
      mainEdit: { 10: 'line 10 on main' },
    });
    stack.sh(['config', '--global', 'diff.context', '10']);
    stack.sh(['config', '--global', 'diff.interHunkContext', '10']);
    expect(stack.assertPreserved()).toBe('preserved');
  });

  it("still compares patches when the user's config colours every diff", () => {
    const stack = rebaseLowerPullRequest({ rewrite: { 10: 'line 10 rewritten' } });
    stack.sh(['config', '--global', 'color.diff', 'always']);
    expect(stack.assertPreserved).toThrow(/PR #1512 \(campaign\/lower\)/);
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
      patchIdByRange: {
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
      patchIdByRange: {
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
