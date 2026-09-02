import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDisposableWorktree,
  DIFF_CONTEXT_LINES,
  git,
  PACKET_FILES,
  removeDisposableWorktree,
  resolveScope,
  snapshotWorkingTree,
  WORKTREE_INSTALL_ARGS,
  writeReviewPacket,
} from '../worktree.mjs';

let root;
let repo;

function sh(args, cwd = repo) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rival-worktree-test-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  sh(['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
  sh(['add', '.']);
  sh(['commit', '-q', '-m', 'first']);
  sh(['checkout', '-q', '-b', 'feature']);
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
  sh(['commit', '-q', '-am', 'second']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scope resolution', () => {
  it('resolves a branch against its merge base', () => {
    const scope = resolveScope(repo, { kind: 'base', base: 'main' });
    expect(scope).toMatchObject({
      base: sh(['rev-parse', 'main']),
      head: sh(['rev-parse', 'HEAD']),
    });
    expect(scope.description).toContain('main');
  });

  it('resolves one commit against its parent', () => {
    const head = sh(['rev-parse', 'HEAD']);
    expect(resolveScope(repo, { kind: 'commit', commit: 'HEAD' })).toMatchObject({
      base: sh(['rev-parse', 'HEAD^']),
      head,
    });
  });

  it('takes a PR scope from the recorded OIDs and refuses a short one', () => {
    const head = sh(['rev-parse', 'HEAD']);
    const base = sh(['rev-parse', 'main']);
    expect(
      resolveScope(repo, { kind: 'pr', number: 7, baseRefOid: base, headRefOid: head })
    ).toMatchObject({ base, head, description: 'pull request 7' });
    expect(() =>
      resolveScope(repo, { kind: 'pr', number: 7, baseRefOid: base.slice(0, 7), headRefOid: head })
    ).toThrow(/full commit id/);
  });

  it('snapshots tracked edits and untracked files into a commit without touching the index', () => {
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n');
    writeFileSync(join(repo, 'new.txt'), 'new\n');
    writeFileSync(join(repo, 'ignored.txt'), 'secret\n');
    const scope = resolveScope(repo, { kind: 'uncommitted' });
    expect(scope.base).toBe(sh(['rev-parse', 'HEAD']));
    expect(sh(['show', `${scope.head}:a.txt`])).toBe('one\ntwo\nthree');
    expect(sh(['show', `${scope.head}:new.txt`])).toBe('new');
    expect(() => sh(['show', `${scope.head}:ignored.txt`])).toThrow();
    expect(sh(['rev-parse', `${scope.head}^`])).toBe(scope.base);
    expect(sh(['status', '--porcelain'])).toContain('?? new.txt');
    expect(sh(['diff', '--cached', '--name-only'])).toBe('');
    expect(sh(['stash', 'list'])).toBe('');
  });

  it('snapshots an unchanged tree as a commit whose diff against HEAD is empty', () => {
    const head = snapshotWorkingTree(repo);
    expect(sh(['diff', 'HEAD', head])).toBe('');
  });
});

describe('disposable worktree and packet', () => {
  it('checks the head out detached, writes the packet, and removes cleanly', () => {
    const scope = resolveScope(repo, { kind: 'base', base: 'main' });
    const directory = join(root, 'wt');
    createDisposableWorktree(repo, scope.head, directory, { install: false });
    expect(readFileSync(join(directory, 'a.txt'), 'utf8')).toBe('one\ntwo\n');
    expect(git(directory, ['rev-parse', 'HEAD'])).toBe(scope.head);
    expect(git(directory, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('HEAD');

    const packet = join(root, 'packet');
    mkdirSync(packet);
    writeReviewPacket(repo, scope, packet);
    expect(readFileSync(join(packet, PACKET_FILES.diff), 'utf8')).toContain('+two');
    expect(WORKTREE_INSTALL_ARGS).toContain('--ignore-scripts');
    expect(WORKTREE_INSTALL_ARGS).toContain('--frozen-lockfile');
    expect(readFileSync(join(packet, PACKET_FILES.commits), 'utf8')).toContain('second');
    expect(readFileSync(join(packet, PACKET_FILES.files), 'utf8')).toMatch(/^M\ta\.txt/);
    expect(JSON.parse(readFileSync(join(packet, PACKET_FILES.scope), 'utf8'))).toMatchObject({
      base: scope.base,
      head: scope.head,
      range: `${scope.base}...${scope.head}`,
    });

    removeDisposableWorktree(repo, directory);
    expect(existsSync(directory)).toBe(false);
    expect(sh(['worktree', 'list'])).not.toContain('wt');
  });

  // The rival's second real round found this: a developer's diff.context widened the packet past
  // what GitHub renders, so the poster would have accepted anchors GitHub then rejected.
  it('pins the packet diff to the context GitHub renders regardless of git config', () => {
    sh(['config', 'diff.context', '10']);
    writeFileSync(
      join(repo, 'a.txt'),
      `${Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n')}\n`
    );
    sh(['commit', '-q', '-am', 'thirty lines']);
    const lines = readFileSync(join(repo, 'a.txt'), 'utf8').split('\n');
    lines[15] = 'changed';
    writeFileSync(join(repo, 'a.txt'), lines.join('\n'));
    sh(['commit', '-q', '-am', 'one change']);
    const scope = resolveScope(repo, { kind: 'commit', commit: 'HEAD' });
    const packet = join(root, 'packet-context');
    mkdirSync(packet);
    writeReviewPacket(repo, scope, packet);
    const hunk = readFileSync(join(packet, PACKET_FILES.diff), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('@@'));
    const span = DIFF_CONTEXT_LINES * 2 + 1;
    expect(hunk).toMatch(new RegExp(`^@@ -13,${span} \\+13,${span} @@`));
  });
});
