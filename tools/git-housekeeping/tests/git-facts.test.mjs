import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  branchLandedVerbatim,
  deleteRefAtCommit,
  isAncestor,
  isPatchEquivalent,
  listBranchRefs,
  parseBranchRefs,
  parseWorktreeList,
  squashMatches,
} from '../lib/git-facts.mjs';
import { createTempRepo } from './fixtures/temp-repo.mjs';

describe('parseWorktreeList', () => {
  it('reads every attribute git prints and keeps the main checkout first', () => {
    const porcelain = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /tmp/wt-detached',
      'HEAD bbbb',
      'detached',
      '',
      'worktree /tmp/wt-locked',
      'HEAD cccc',
      'branch refs/heads/feature',
      'locked capture in progress',
      '',
      'worktree /tmp/wt-gone',
      'HEAD dddd',
      'detached',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n');

    expect(parseWorktreeList(porcelain)).toEqual([
      {
        path: '/repo',
        head: 'aaaa',
        branch: 'main',
        detached: false,
        bare: false,
        locked: null,
        prunable: null,
      },
      {
        path: '/tmp/wt-detached',
        head: 'bbbb',
        branch: null,
        detached: true,
        bare: false,
        locked: null,
        prunable: null,
      },
      {
        path: '/tmp/wt-locked',
        head: 'cccc',
        branch: 'feature',
        detached: false,
        bare: false,
        locked: 'capture in progress',
        prunable: null,
      },
      {
        path: '/tmp/wt-gone',
        head: 'dddd',
        branch: null,
        detached: true,
        bare: false,
        locked: null,
        prunable: 'gitdir file points to non-existent location',
      },
    ]);
  });
});

describe('parseBranchRefs', () => {
  it('splits the tab-separated for-each-ref line and reads [gone] upstreams', () => {
    const line = [
      'agent/x',
      'abc',
      'origin/agent/x',
      '[gone]',
      '1700000000',
      '2023-11-14 22:13:20 +0000',
      'someone',
      'subject here',
      '0 12',
    ].join('\t');
    expect(parseBranchRefs(`${line}\n`)).toEqual([
      {
        name: 'agent/x',
        tip: 'abc',
        upstream: 'origin/agent/x',
        upstreamGone: true,
        committedAt: 1700000000,
        date: '2023-11-14',
        author: 'someone',
        subject: 'subject here',
        ahead: 0,
        behind: 12,
      },
    ]);
  });

  it('reports no upstream as null rather than an empty string', () => {
    const line = ['local', 'abc', '', '', '1', '2024-01-01 00:00:00 +0000', 'a', 's', '2 0'].join(
      '\t'
    );
    expect(parseBranchRefs(line)[0]).toMatchObject({
      upstream: null,
      upstreamGone: false,
      ahead: 2,
    });
  });
});

describe('merged-ness proofs on a real repository', () => {
  let fixture;

  beforeEach(() => {
    fixture = createTempRepo();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('ancestry: a merged branch is an ancestor of origin/main, an unmerged one is not', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'merged']);
    const merged = commit('m.txt', 'm', 'merged work');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--no-ff', 'merged', '-m', 'merge']);
    pushMain();
    sh(['checkout', '-q', '-b', 'unmerged']);
    const unmerged = commit('u.txt', 'u', 'unmerged work');

    expect(isAncestor(merged, 'origin/main', repo)).toBe(true);
    expect(isAncestor(unmerged, 'origin/main', repo)).toBe(false);
  });

  it('patch equivalence: a cherry-picked branch is equivalent, a fresh one is not', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'picked']);
    const picked = commit('p.txt', 'p', 'picked work');
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);
    pushMain();
    sh(['checkout', '-q', '-b', 'fresh', 'main']);
    const fresh = commit('f.txt', 'f', 'fresh work');

    expect(isAncestor(picked, 'origin/main', repo)).toBe(false);
    expect(isPatchEquivalent('origin/main', picked, repo)).toBe(true);
    expect(isPatchEquivalent('origin/main', fresh, repo)).toBe(false);
  });

  it('squash match: a faithful squash matches, one that landed different content does not', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'squashed']);
    commit('s1.txt', 'one', 'part one');
    const tip = commit('s2.txt', 'two', 'part two');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--squash', 'squashed']);
    sh(['commit', '-q', '-m', 'squash of squashed']);
    const squash = sh(['rev-parse', 'HEAD']);
    pushMain();

    expect(isAncestor(tip, 'origin/main', repo)).toBe(false);
    expect(isPatchEquivalent('origin/main', tip, repo)).toBe(false);
    expect(squashMatches('origin/main', tip, squash, repo)).toBe(true);

    sh(['checkout', '-q', 'squashed']);
    const drifted = commit('s3.txt', 'three', 'after the squash');
    expect(squashMatches('origin/main', drifted, squash, repo)).toBe(false);
    expect(squashMatches('origin/main', drifted, null, repo)).toBe(false);
    expect(squashMatches('origin/main', drifted, 'not-a-commit', repo)).toBe(false);
  });

  // Every patch-id git computes ignores whitespace, and this repo reformats
  // Markdown, so a reformat branch can match a base it genuinely differs from.
  it('content proof: whitespace-only difference is NOT on the base, though patch-ids match', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'spaced']);
    commit('message.txt', 'a  b\n', 'add message');
    sh(['checkout', '-q', 'main']);
    commit('message.txt', 'ab\n', 'add message');
    pushMain();

    expect(isPatchEquivalent('origin/main', 'spaced', repo)).toBe(true);
    expect(branchLandedVerbatim('origin/main', 'spaced', repo)).toBe(false);
  });

  it('content proof: accepts a branch whose touched files are byte-identical on the base', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'same']);
    const picked = commit('same.txt', 'same\n', 'add same');
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);
    pushMain();

    expect(isAncestor(picked, 'origin/main', repo)).toBe(false);
    expect(branchLandedVerbatim('origin/main', 'same', repo)).toBe(true);
  });

  it('squash match uses a verbatim patch-id, so a whitespace-differing squash does not match', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'sq']);
    commit('sq.txt', 'one   two\n', 'sq work');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--squash', 'sq']);
    sh(['commit', '-q', '-m', 'squash']);
    const squash = sh(['rev-parse', 'HEAD']);
    pushMain();
    expect(squashMatches('origin/main', 'sq', squash, repo)).toBe(true);

    sh(['checkout', '-q', 'sq']);
    commit('sq.txt', 'one two\n', 'respace the same change');
    expect(squashMatches('origin/main', 'sq', squash, repo)).toBe(false);
  });

  // `git branch -D` re-resolves the name, so a branch that moved between
  // planning and applying is destroyed on a proof about a commit it left.
  it('deleteRefAtCommit removes the ref only while it still points at the proven commit', () => {
    const { sh, commit, repo } = fixture;
    sh(['checkout', '-q', '-b', 'topic']);
    const proven = commit('t.txt', 't', 'proven work');
    sh(['checkout', '-q', 'main']);

    sh(['checkout', '-q', 'topic']);
    commit('later.txt', 'unique', 'work added after planning');
    sh(['checkout', '-q', 'main']);

    const stale = deleteRefAtCommit('topic', proven, repo);
    expect(stale.ok).toBe(false);
    expect(sh(['branch', '--list', 'topic'])).toContain('topic');

    const current = sh(['rev-parse', 'topic']);
    expect(deleteRefAtCommit('topic', current, repo).ok).toBe(true);
    expect(sh(['branch', '--list', 'topic'])).toBe('');
  });

  it('listBranchRefs counts ahead/behind against the requested base for every local branch', () => {
    const { sh, commit, repo, pushMain } = fixture;
    commit('main2.txt', 'x', 'main moves');
    pushMain();
    sh(['checkout', '-q', '-b', 'topic', 'HEAD~1']);
    commit('t.txt', 't', 'topic work');

    const refs = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/heads' });
    expect(refs.map((r) => [r.name, r.ahead, r.behind])).toEqual([
      ['main', 0, 0],
      ['topic', 1, 1],
    ]);
  });
});
