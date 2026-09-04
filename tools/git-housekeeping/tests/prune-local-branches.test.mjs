import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  classifyLocalBranch,
  deleteLocalBranch,
  parsePruneBranchesArgs,
  planLocalBranchPrune,
  plannedOutcome,
  protectedBranchName,
} from '../prune-local-branches.mjs';
import { createTempRepo } from './fixtures/temp-repo.mjs';

describe('parsePruneBranchesArgs', () => {
  it('defaults to a fetching dry run against origin/main', () => {
    expect(parsePruneBranchesArgs([])).toEqual({
      apply: false,
      includeEquivalent: false,
      fetch: true,
      json: false,
      base: 'origin/main',
    });
  });

  it('reads every flag', () => {
    expect(
      parsePruneBranchesArgs([
        '--apply',
        '--include-equivalent',
        '--no-fetch',
        '--json',
        '--base=origin/dev',
      ])
    ).toEqual({
      apply: true,
      includeEquivalent: true,
      fetch: false,
      json: true,
      base: 'origin/dev',
    });
  });

  // A misspelled safety flag must not fall through to a run that deletes.
  it('rejects unknown flags', () => {
    expect(() => parsePruneBranchesArgs(['--aply'])).toThrow(/--aply/);
    expect(() => parsePruneBranchesArgs(['--force'])).toThrow();
  });
});

describe('classifyLocalBranch', () => {
  const branch = (overrides) => ({
    name: 'topic',
    tip: 'abc',
    upstream: null,
    upstreamGone: false,
    ahead: 1,
    behind: 0,
    ...overrides,
  });
  const ctx = (overrides) => ({
    base: 'origin/main',
    currentBranch: 'work',
    heldBy: new Map(),
    prIndex: new Map(),
    prLookupOk: true,
    proofs: { isAncestor: () => false, isPatchEquivalent: () => false, squashMatches: () => false },
    ...overrides,
  });

  it('never touches the base branch, the current checkout, a worktree-held branch, or an open PR', () => {
    expect(protectedBranchName('origin/main')).toBe('main');
    expect(classifyLocalBranch(branch({ name: 'main', ahead: 0 }), ctx())).toEqual({
      tier: 'skip',
      reason: 'protected base branch',
    });
    expect(classifyLocalBranch(branch({ name: 'work', ahead: 0 }), ctx())).toEqual({
      tier: 'skip',
      reason: 'current checkout',
    });
    expect(
      classifyLocalBranch(branch({ ahead: 0 }), ctx({ heldBy: new Map([['topic', '/tmp/wt']]) }))
    ).toEqual({ tier: 'skip', reason: 'in use: checked out in /tmp/wt' });
    expect(
      classifyLocalBranch(
        branch({ ahead: 0 }),
        ctx({ prIndex: new Map([['topic', { number: 7, state: 'OPEN', mergeCommit: null }]]) })
      )
    ).toEqual({ tier: 'skip', reason: 'PR #7 open' });
  });

  it('proves merged by ancestry, noting a gone upstream', () => {
    expect(classifyLocalBranch(branch({ ahead: 0, upstreamGone: true }), ctx())).toEqual({
      tier: 'merged',
      reason: 'merged into origin/main, upstream gone',
    });
    expect(classifyLocalBranch(branch(), ctx({ proofs: { isAncestor: () => true } })).tier).toBe(
      'merged'
    );
  });

  it('proves equivalent by patch-id or by a matching squash commit', () => {
    const merged = new Map([
      ['topic', { number: 9, state: 'MERGED', mergeCommit: 'deadbeefdeadbeef' }],
    ]);
    expect(
      classifyLocalBranch(
        branch(),
        ctx({ prIndex: merged, proofs: { isAncestor: () => false, isPatchEquivalent: () => true } })
      )
    ).toEqual({
      tier: 'equivalent',
      reason: 'every commit has a patch-equivalent on origin/main (rebase-merged, PR #9 merged)',
    });
    expect(
      classifyLocalBranch(
        branch(),
        ctx({
          prIndex: merged,
          proofs: {
            isAncestor: () => false,
            isPatchEquivalent: () => false,
            squashMatches: () => true,
          },
        })
      )
    ).toEqual({
      tier: 'equivalent',
      reason: 'squash-merged as PR #9 (branch diff matches deadbeefdead)',
    });
  });

  it('hands everything unproven to the judgment pass with the reason it needs', () => {
    const merged = new Map([['topic', { number: 9, state: 'MERGED', mergeCommit: 'deadbeef' }]]);
    expect(classifyLocalBranch(branch(), ctx({ prIndex: merged }))).toEqual({
      tier: 'keep',
      reason:
        'PR #9 merged but the branch carries changes its merge commit does not — judgment pass',
    });
    const closed = new Map([['topic', { number: 3, state: 'CLOSED', mergeCommit: null }]]);
    expect(classifyLocalBranch(branch(), ctx({ prIndex: closed }))).toEqual({
      tier: 'keep',
      reason: 'PR #3 closed unmerged — judgment pass',
    });
    expect(classifyLocalBranch(branch({ ahead: 2, upstreamGone: true }), ctx())).toEqual({
      tier: 'keep',
      reason: '2 unique commits, no PR, upstream gone — judgment pass',
    });
    expect(classifyLocalBranch(branch(), ctx({ prLookupOk: false })).reason).toBe(
      '1 unique commit, PR state unknown — judgment pass'
    );
  });

  it('plans the equivalent tier as proven until the -D flag is given', () => {
    expect(plannedOutcome({ tier: 'equivalent' }, { includeEquivalent: false })).toBe('proven');
    expect(plannedOutcome({ tier: 'equivalent' }, { includeEquivalent: true })).toBe('delete -D');
    expect(plannedOutcome({ tier: 'merged' }, { includeEquivalent: false })).toBe('delete');
    expect(plannedOutcome({ tier: 'skip', reason: 'in use: x' }, {})).toBe('skip (in use)');
    expect(plannedOutcome({ tier: 'skip', reason: 'PR #1 open' }, {})).toBe('skip');
  });
});

describe('planning and deleting on a real repository', () => {
  let fixture;

  beforeEach(() => {
    fixture = createTempRepo();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function buildScenario() {
    const { sh, commit, pushMain, root } = fixture;
    sh(['checkout', '-q', '-b', 'merged']);
    commit('m.txt', 'm', 'merged work');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--no-ff', 'merged', '-m', 'merge merged']);

    sh(['checkout', '-q', '-b', 'rebased']);
    const picked = commit('r.txt', 'r', 'rebased work');
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);

    sh(['checkout', '-q', '-b', 'squashed']);
    commit('s1.txt', 'one', 'part one');
    commit('s2.txt', 'two', 'part two');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--squash', 'squashed']);
    sh(['commit', '-q', '-m', 'squash of squashed']);
    const squashCommit = sh(['rev-parse', 'HEAD']);

    sh(['checkout', '-q', '-b', 'gone']);
    sh(['push', '-q', '-u', 'origin', 'gone']);
    sh(['checkout', '-q', 'main']);
    sh(['push', '-q', 'origin', '--delete', 'gone']);

    sh(['checkout', '-q', '-b', 'unmerged']);
    commit('u.txt', 'u', 'unmerged work');
    sh(['checkout', '-q', '-b', 'closed', 'main']);
    commit('c.txt', 'c', 'rejected work');
    sh(['checkout', '-q', '-b', 'open', 'main']);
    commit('o.txt', 'o', 'in-flight work');
    sh(['checkout', '-q', 'main']);
    sh(['branch', '-q', 'held', 'main']);
    sh(['worktree', 'add', '-q', join(root, 'wt-held'), 'held']);
    pushMain();
    sh(['fetch', '-q', '--prune', 'origin']);
    sh(['checkout', '-q', '-b', 'current', 'main']);

    const prIndex = new Map([
      ['squashed', { number: 2, state: 'MERGED', mergeCommit: squashCommit }],
      ['closed', { number: 3, state: 'CLOSED', mergeCommit: null }],
      ['open', { number: 4, state: 'OPEN', mergeCommit: null }],
    ]);
    return prIndex;
  }

  it('classifies every shape of branch and deletes only what its tier allows', () => {
    const prIndex = buildScenario();
    const { repo, sh } = fixture;
    const plan = () =>
      planLocalBranchPrune({ cwd: repo, base: 'origin/main', prIndex, prLookupOk: true });

    const tiers = Object.fromEntries(plan().map((row) => [row.name, row.tier]));
    expect(tiers).toEqual({
      main: 'skip',
      current: 'skip',
      held: 'skip',
      open: 'skip',
      merged: 'merged',
      gone: 'merged',
      rebased: 'equivalent',
      squashed: 'equivalent',
      unmerged: 'keep',
      closed: 'keep',
    });
    expect(plan().find((row) => row.name === 'gone').reason).toBe(
      'merged into origin/main, upstream gone'
    );

    const applyAll = (includeEquivalent) =>
      Object.fromEntries(
        plan().map((row) => [
          row.name,
          deleteLocalBranch(row, { cwd: repo, base: 'origin/main', includeEquivalent })?.outcome ??
            null,
        ])
      );

    expect(applyAll(false)).toEqual({
      main: null,
      current: null,
      held: null,
      open: null,
      unmerged: null,
      closed: null,
      merged: 'deleted',
      gone: 'deleted',
      rebased: 'kept',
      squashed: 'kept',
    });
    expect(sh(['branch', '--list', '--format=%(refname:short)']).split('\n').sort()).toEqual(
      ['closed', 'current', 'held', 'main', 'open', 'rebased', 'squashed', 'unmerged'].sort()
    );

    expect(applyAll(true)).toMatchObject({ rebased: 'deleted', squashed: 'deleted' });
    expect(sh(['branch', '--list', '--format=%(refname:short)']).split('\n').sort()).toEqual(
      ['closed', 'current', 'held', 'main', 'open', 'unmerged'].sort()
    );
  });

  // `git branch -d` judges merged-ness against HEAD, so a checkout that is
  // behind origin/main refuses branches origin/main already contains.
  it('reports a -d refusal from a stale HEAD instead of forcing, unless asked to', () => {
    const { sh, commit, pushMain, repo } = fixture;
    sh(['checkout', '-q', '-b', 'stale-head']);
    sh(['checkout', '-q', '-b', 'merged-later', 'main']);
    commit('l.txt', 'l', 'later work');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--no-ff', 'merged-later', '-m', 'merge later']);
    pushMain();
    sh(['checkout', '-q', 'stale-head']);

    const row = planLocalBranchPrune({
      cwd: repo,
      base: 'origin/main',
      prIndex: new Map(),
      prLookupOk: true,
    }).find((r) => r.name === 'merged-later');
    expect(row.tier).toBe('merged');

    const refused = deleteLocalBranch(row, {
      cwd: repo,
      base: 'origin/main',
      includeEquivalent: false,
    });
    expect(refused.outcome).toBe('kept');
    expect(refused.reason).toMatch(/git branch -d refused/);
    expect(sh(['branch', '--list', 'merged-later'])).toContain('merged-later');

    const forced = deleteLocalBranch(row, {
      cwd: repo,
      base: 'origin/main',
      includeEquivalent: true,
    });
    expect(forced.outcome).toBe('deleted');
    expect(forced.reason).toMatch(/-D after proof/);
    expect(sh(['branch', '--list', 'merged-later'])).toBe('');
  });
});
