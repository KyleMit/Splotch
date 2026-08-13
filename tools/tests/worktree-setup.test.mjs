import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainCheckoutRoot, parseWorktreeInclude, planIncludeCopies } from '../worktree-setup.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');

describe('parseWorktreeInclude', () => {
  it('keeps entries and drops blanks and comments', () => {
    const content = 'web/.env\n\n# local secrets\n  other/file  \n';

    expect(parseWorktreeInclude(content)).toEqual(['web/.env', 'other/file']);
  });

  it('parses the repo .worktreeinclude into safe relative paths', () => {
    const entries = parseWorktreeInclude(readFileSync(join(repoRoot, '.worktreeinclude'), 'utf8'));

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(isAbsolute(entry), `absolute path in .worktreeinclude: ${entry}`).toBe(false);
      expect(entry.split('/'), `path traversal in .worktreeinclude: ${entry}`).not.toContain('..');
    }
  });
});

describe('mainCheckoutRoot', () => {
  it('returns the main checkout for a linked worktree', () => {
    const root = mainCheckoutRoot({
      gitDir: '/repos/splotch/.git/worktrees/feature',
      gitCommonDir: '/repos/splotch/.git',
    });

    expect(root).toBe('/repos/splotch');
  });

  it('returns null in the main checkout', () => {
    const root = mainCheckoutRoot({
      gitDir: '/repos/splotch/.git',
      gitCommonDir: '/repos/splotch/.git',
    });

    expect(root).toBeNull();
  });
});

describe('planIncludeCopies', () => {
  const mainRoot = '/main';
  const worktreeRoot = '/wt';

  it('copies a file that exists only in the main checkout', () => {
    const plan = planIncludeCopies({
      entries: ['web/.env'],
      mainRoot,
      worktreeRoot,
      existsAt: (path) => path === '/main/web/.env',
    });

    expect(plan).toEqual([
      { entry: 'web/.env', action: 'copy', from: '/main/web/.env', to: '/wt/web/.env' },
    ]);
  });

  it('never overwrites a file already present in the worktree', () => {
    const plan = planIncludeCopies({
      entries: ['web/.env'],
      mainRoot,
      worktreeRoot,
      existsAt: () => true,
    });

    expect(plan).toEqual([{ entry: 'web/.env', action: 'kept-existing' }]);
  });

  it('reports a file missing from the main checkout', () => {
    const plan = planIncludeCopies({
      entries: ['web/.env'],
      mainRoot,
      worktreeRoot,
      existsAt: () => false,
    });

    expect(plan).toEqual([{ entry: 'web/.env', action: 'missing-source' }]);
  });
});
