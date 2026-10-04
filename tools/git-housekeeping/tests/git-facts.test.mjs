import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  branchLandedVerbatim,
  deleteRefAtCommit,
  worktreeHoldingBranch,
  isAncestor,
  isPatchEquivalent,
  listBranchRefs,
  listWorktrees,
  parseBranchRefs,
  parseWorktreeList,
  squashMatches,
} from '../lib/git-facts.mjs';
import { createTempRepo, REAL_REPO_TEST_OPTIONS } from './fixtures/temp-repo.mjs';

const nulTerminated = (entries) => entries.map((entry) => `${entry}\0`).join('');

describe('parseWorktreeList', () => {
  it('reads every attribute git prints and keeps the main checkout first', () => {
    const porcelain = nulTerminated([
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
    ]);

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

  it('keeps a newline inside a path or a lock reason as part of it', () => {
    const porcelain = nulTerminated([
      'worktree /tmp/wt\nbranch refs/heads/main',
      'HEAD aaaa',
      'branch refs/heads/feature',
      'locked two\nlines',
      '',
    ]);

    expect(parseWorktreeList(porcelain)).toMatchObject([
      { path: '/tmp/wt\nbranch refs/heads/main', branch: 'feature', locked: 'two\nlines' },
    ]);
  });

  // An empty worktree list lifts the in-use guard from every branch.
  it('refuses newline-terminated output instead of reading it as no worktrees', () => {
    expect(() => parseWorktreeList('worktree /repo\nHEAD aaaa\nbranch refs/heads/main\n')).toThrow(
      /expected NUL-terminated git output/
    );
  });
});

describe('parseBranchRefs', () => {
  const TIP = 'a'.repeat(40);
  const record = (overrides = {}) =>
    nulTerminated(
      Object.values({
        name: 'agent/x',
        tip: TIP,
        upstream: 'origin/agent/x',
        track: '[gone]',
        unix: '1700000000',
        iso: '2023-11-14 22:13:20 +0000',
        author: 'someone',
        subject: 'subject here',
        aheadBehind: '0 12',
        ...overrides,
      })
    );

  it('reads each NUL-terminated for-each-ref record and reads [gone] upstreams', () => {
    const listing = `${record()}\n${record({ name: 'local', upstream: '', track: '', aheadBehind: '2 0' })}\n`;
    expect(parseBranchRefs(listing)).toEqual([
      {
        name: 'agent/x',
        tip: TIP,
        upstream: 'origin/agent/x',
        upstreamGone: true,
        committedAt: 1700000000,
        date: '2023-11-14',
        author: 'someone',
        subject: 'subject here',
        ahead: 0,
        behind: 12,
      },
      expect.objectContaining({ name: 'local', upstream: null, upstreamGone: false, ahead: 2 }),
    ]);
    expect(parseBranchRefs('')).toEqual([]);
  });

  it('keeps a tab or a newline inside a free-text field out of the other columns', () => {
    const upstream = 'origin/up\nstream\t0 0';
    const author = 'Tab\tAuthor';
    const subject = '  Add rows\t0 0 to the table ';
    const listing = record({ upstream, author, subject, aheadBehind: '2 1' });
    expect(parseBranchRefs(listing)).toEqual([
      expect.objectContaining({ upstream, author, subject, ahead: 2, behind: 1 }),
    ]);
  });

  it.each([
    ['the ahead/behind counts', { aheadBehind: '' }],
    ['the ahead/behind counts', { aheadBehind: '0 0 to the table' }],
    ['the ahead/behind counts', { aheadBehind: '2' }],
    ['the commit date', { unix: '' }],
    ['the commit id', { tip: 'subject here' }],
  ])('refuses a record that does not hold %s, naming the branch', (field, overrides) => {
    expect(() => parseBranchRefs(record(overrides))).toThrow(
      new RegExp(`as ${field} of "agent/x"; refusing to guess`)
    );
  });

  it('refuses a listing that is not whole NUL-terminated records', () => {
    expect(() => parseBranchRefs(record().replaceAll('\0', '\t'))).toThrow(
      /expected NUL-terminated git output/
    );
    expect(() => parseBranchRefs(`${record()}\nextra\0`)).toThrow(/not whole records of 9/);
  });
});

describe('merged-ness proofs on a real repository', REAL_REPO_TEST_OPTIONS, () => {
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

  // A Markdown hard break at the end of an appended doc is trailing whitespace on
  // the last line of the diff, the one place a trimmed diff loses it.
  it('content proof: trailing whitespace on the last line of a diff is NOT on the base', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'trailing']);
    commit('notes.md', 'x  \n', 'add notes');
    sh(['checkout', '-q', 'main']);
    commit('notes.md', 'x\n', 'add notes');
    pushMain();

    expect(isPatchEquivalent('origin/main', 'trailing', repo)).toBe(true);
    expect(branchLandedVerbatim('origin/main', 'trailing', repo)).toBe(false);
  });

  // Hashed as UTF-8 text, every invalid byte is the same replacement character.
  it('content proof: a change that differs only in a non-UTF-8 byte is NOT on the base', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'latin1']);
    commit('menu.txt', Buffer.from('caf\xe9\n', 'latin1'), 'add menu');
    sh(['checkout', '-q', 'main']);
    const landed = commit('menu.txt', Buffer.from('caf\xe8\n', 'latin1'), 'add menu');
    pushMain();

    expect(branchLandedVerbatim('origin/main', 'latin1', repo)).toBe(false);
    expect(squashMatches('origin/main', 'latin1', landed, repo)).toBe(false);
  });

  // A textconv driver renders a file for reading, and two different files can
  // render alike, so a diff hashed through one matches a change that never landed.
  it('content proof: a textconv driver that renders two changes alike proves nothing', () => {
    const { sh, commit, repo, pushMain } = fixture;
    writeFileSync(join(repo, '.git', 'info', 'attributes'), 'menu.txt diff=lossy\n');
    sh(['config', 'diff.lossy.textconv', 'cut -c1-4']);
    sh(['checkout', '-q', '-b', 'menu']);
    commit('menu.txt', 'soup today\n', 'add menu');
    sh(['checkout', '-q', 'main']);
    const landed = commit('menu.txt', 'soup tomorrow\n', 'add menu');
    pushMain();

    expect(branchLandedVerbatim('origin/main', 'menu', repo)).toBe(false);
    expect(squashMatches('origin/main', 'menu', landed, repo)).toBe(false);
  });

  // The library's git calls read the repository's config, and either setting
  // rewrites `git diff` into output `patch-id` cannot read.
  it.each([
    ['color.diff', 'always'],
    ['diff.external', 'echo'],
  ])('content proof: a landed branch stays proven when the repository sets %s=%s', (key, value) => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'landed']);
    const picked = commit('landed.txt', 'landed\n', 'add landed');
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);
    const counterpart = sh(['rev-parse', 'HEAD']);
    pushMain();
    sh(['config', key, value]);

    expect(branchLandedVerbatim('origin/main', 'landed', repo)).toBe(true);
    expect(squashMatches('origin/main', 'landed', counterpart, repo)).toBe(true);
  });

  it('content proof: accepts a branch whose every commit has a verbatim counterpart on the base', () => {
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

  it('squash match: a later commit adding trailing whitespace to the last line does not match', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'sq']);
    commit('notes.md', 'x\n', 'add notes');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--squash', 'sq']);
    sh(['commit', '-q', '-m', 'squash']);
    const squash = sh(['rev-parse', 'HEAD']);
    pushMain();
    expect(squashMatches('origin/main', 'sq', squash, repo)).toBe(true);

    sh(['checkout', '-q', 'sq']);
    commit('notes.md', 'x  \n', 'end the line with a hard break');
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

  // `update-ref` is lower-level than `git branch -D` and drops its refusal to
  // delete a branch checked out elsewhere, which would leave that session's
  // HEAD pointing at a ref that no longer exists.
  it('deleteRefAtCommit refuses a branch checked out in a worktree, even at the right commit', () => {
    const { sh, commit, repo, root } = fixture;
    sh(['checkout', '-q', '-b', 'topic']);
    const tip = commit('t.txt', 't', 'topic work');
    sh(['checkout', '-q', 'main']);
    const worktree = join(root, 'live-session');
    sh(['worktree', 'add', '-q', worktree, 'topic']);

    expect(worktreeHoldingBranch('topic', repo)).toContain('live-session');
    const refused = deleteRefAtCommit('topic', tip, repo);
    expect(refused.ok).toBe(false);
    expect(refused.stderr).toMatch(/checked out in/);
    expect(sh(['branch', '--list', 'topic'])).toContain('topic');
    expect(sh(['rev-parse', 'HEAD'], { cwd: worktree })).toBe(tip);

    sh(['worktree', 'remove', worktree]);
    expect(deleteRefAtCommit('topic', tip, repo).ok).toBe(true);
  });

  // The counts decide the merged verdict, and a subject of `…<TAB>0 0 …` is what
  // a tab-separated listing reads as zero commits ahead and zero behind.
  it('listBranchRefs reads the real counts of a branch whose subject holds a tab and two zeros', () => {
    const { sh, commit, repo, pushMain } = fixture;
    const subject = 'Add rows\t0 0 to the table';
    commit('main2.txt', 'x', 'main moves');
    pushMain();
    sh(['checkout', '-q', '-b', 'tabbed', 'HEAD~1']);
    commit('t1.txt', '1', 'first unmerged commit');
    commit('t2.txt', '2', subject);
    sh(['push', '-q', 'origin', 'tabbed']);

    expect(sh(['rev-list', '--count', 'origin/main..tabbed'])).toBe('2');
    const local = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/heads' });
    expect(local.find((ref) => ref.name === 'tabbed')).toMatchObject({
      subject,
      ahead: 2,
      behind: 1,
    });
    const remote = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/remotes/origin' });
    expect(remote.find((ref) => ref.name === 'origin/tabbed')).toMatchObject({
      subject,
      ahead: 2,
      behind: 1,
    });
  });

  it('listBranchRefs keeps a tab in an author or an upstream name out of the counts', () => {
    const { sh, repo } = fixture;
    const author = 'Tab\tAuthor';
    sh(['checkout', '-q', '-b', 'topic']);
    sh(['commit', '-q', '--allow-empty', '-m', 'topic work'], {
      extraEnv: { GIT_AUTHOR_NAME: author },
    });
    sh(['config', 'branch.topic.remote', 'origin']);
    sh(['config', 'branch.topic.merge', 'refs/heads/up\tstream\t0 0']);

    const refs = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/heads' });
    expect(refs.find((ref) => ref.name === 'topic')).toMatchObject({
      upstream: 'origin/up\tstream\t0 0',
      upstreamGone: true,
      author,
      subject: 'topic work',
      ahead: 1,
      behind: 0,
    });
  });

  // A ref name may hold `)` and `%(`, so a base interpolated by name into
  // `%(ahead-behind:…)` closes the atom early and counts against `main`.
  it('listBranchRefs counts against a base whose name holds format syntax', () => {
    const { sh, commit, repo } = fixture;
    sh(['branch', 'main)%(symref', 'main']);
    sh(['checkout', '-q', '-b', 'topic']);
    commit('t.txt', 't', 'topic work');
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--ff-only', 'topic']);

    const refs = listBranchRefs(repo, { base: 'main)%(symref', namespace: 'refs/heads' });
    expect(refs.find((ref) => ref.name === 'topic')).toMatchObject({ ahead: 1, behind: 0 });
    expect(() => listBranchRefs(repo, { base: 'no-such-base', namespace: 'refs/heads' })).toThrow(
      /no-such-base/
    );
  });

  it('listWorktrees reads a worktree whose path holds a newline', () => {
    const { sh, repo } = fixture;
    const checkout = sh(['rev-parse', '--show-toplevel']);
    const worktree = join(dirname(checkout), 'wt\nbranch refs/heads/main');
    sh(['worktree', 'add', '-q', '-b', 'held', worktree, 'main']);

    expect(listWorktrees(repo).map(({ path, branch }) => [path, branch])).toEqual([
      [checkout, 'main'],
      [worktree, 'held'],
    ]);
    expect(worktreeHoldingBranch('held', repo)).toBe(worktree);
  });

  it('content proof: finds the landed counterpart of a commit on a path git would quote', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'named']);
    const picked = commit(' caf\u00e9\tmenu.txt', 'same\n', 'add a menu');
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);
    pushMain();

    expect(isAncestor(picked, 'origin/main', repo)).toBe(false);
    expect(branchLandedVerbatim('origin/main', 'named', repo)).toBe(true);
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

  // The remote's HEAD pointer resolves to the base, so it reports zero ahead and
  // zero behind and reads as a branch holding nothing new — the shape every triage
  // bucket collects for deletion. Its short name is the bare remote name, which is
  // what a `git push --delete` would then be handed.
  it('listBranchRefs omits the remote HEAD pointer from the remotes namespace', () => {
    const { sh, commit, repo, pushMain } = fixture;
    commit('main2.txt', 'x', 'main moves');
    pushMain();
    sh(['checkout', '-q', '-b', 'shipped']);
    commit('s.txt', 's', 'shipped work');
    sh(['push', '-q', 'origin', 'shipped']);
    sh(['remote', 'set-head', 'origin', 'main']);

    expect(sh(['symbolic-ref', 'refs/remotes/origin/HEAD'])).toBe('refs/remotes/origin/main');

    const refs = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/remotes/origin' });
    expect(refs.map((r) => r.name).sort()).toEqual(['origin/main', 'origin/shipped']);
    expect(refs.map((r) => r.name)).not.toContain('origin');
  });

  it('listBranchRefs omits the HEAD pointer of a remote whose name contains a slash', () => {
    const { sh, repo } = fixture;
    sh(['remote', 'add', 'team/upstream', sh(['remote', 'get-url', 'origin'])]);
    sh(['fetch', '-q', 'team/upstream']);
    sh(['remote', 'set-head', 'team/upstream', 'main']);

    const refs = listBranchRefs(repo, {
      base: 'origin/main',
      namespace: 'refs/remotes/team/upstream',
    });
    expect(refs.map((r) => r.name)).toEqual(['team/upstream/main']);
  });

  it('listBranchRefs keeps a real branch whose name starts with HEAD/', () => {
    const { sh, commit, repo } = fixture;
    sh(['checkout', '-q', '-b', 'HEAD/feature']);
    commit('h.txt', 'h', 'head-prefixed work');
    sh(['push', '-q', 'origin', 'HEAD/feature']);

    const remote = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/remotes/origin' });
    expect(remote.map((r) => r.name).sort()).toEqual(['origin/HEAD/feature', 'origin/main']);
    const local = listBranchRefs(repo, { base: 'origin/main', namespace: 'refs/heads' });
    expect(local.map((r) => r.name)).toContain('HEAD/feature');
  });
});
