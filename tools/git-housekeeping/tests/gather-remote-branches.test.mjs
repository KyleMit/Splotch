import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatRemoteBranchTable,
  gatherRemoteBranches,
  parseGatherArgs,
} from '../gather-remote-branches.mjs';
import { createTempRepo } from './fixtures/temp-repo.mjs';

describe('parseGatherArgs', () => {
  it('defaults to fetching, a table, and origin/main', () => {
    expect(parseGatherArgs([])).toEqual({
      json: false,
      fetch: true,
      base: 'main',
      remote: 'origin',
    });
    expect(parseGatherArgs(['--json', '--no-fetch', '--base=dev'])).toEqual({
      json: true,
      fetch: false,
      base: 'dev',
      remote: 'origin',
    });
    expect(() => parseGatherArgs(['--prune'])).toThrow();
  });
});

describe('gatherRemoteBranches on a real repository', () => {
  let fixture;

  beforeEach(() => {
    fixture = createTempRepo();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('reports ahead/behind/inbase per remote branch, oldest first, marking the current one', () => {
    const { sh, commit, repo, pushMain } = fixture;
    sh(['checkout', '-q', '-b', 'stale']);
    commit('s.txt', 's', 'stale work', { date: '2020-01-01T00:00:00Z' });
    sh(['push', '-q', '-u', 'origin', 'stale']);
    sh(['checkout', '-q', 'main']);
    sh(['merge', '-q', '--no-ff', 'stale', '-m', 'merge stale']);

    sh(['checkout', '-q', '-b', 'picked']);
    const picked = commit('p.txt', 'p', 'picked work', { date: '2021-01-01T00:00:00Z' });
    sh(['push', '-q', '-u', 'origin', 'picked']);
    sh(['checkout', '-q', 'main']);
    commit('filler.txt', 'main moves on', 'unrelated main commit');
    sh(['cherry-pick', picked]);
    pushMain();

    sh(['checkout', '-q', '-b', 'fresh']);
    commit('f.txt', 'f', 'fresh work');
    sh(['push', '-q', '-u', 'origin', 'fresh']);

    const rows = gatherRemoteBranches({ cwd: repo, base: 'main', remote: 'origin' });
    expect(rows.map((r) => r.branch)).toEqual(['stale', 'picked', 'fresh']);
    expect(rows.map((r) => [r.branch, r.ahead, r.inbase, r.isCurrent])).toEqual([
      ['stale', 0, true, false],
      ['picked', 1, true, false],
      ['fresh', 1, false, true],
    ]);
    expect(rows[0].ageDays).toBeGreaterThan(rows[2].ageDays);

    const table = formatRemoteBranchTable(rows, { base: 'main' });
    expect(table).toContain('inbase');
    expect(table).toMatch(/^fresh\s+\*/m);
    expect(table).toContain('3 branches (base=main)');
  });
});
