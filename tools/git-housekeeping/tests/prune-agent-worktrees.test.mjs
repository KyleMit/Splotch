import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePruneWorktreesArgs,
  planWorktreePrune,
  removeWorktree,
} from '../prune-agent-worktrees.mjs';
import { createTempRepo } from './fixtures/temp-repo.mjs';

describe('parsePruneWorktreesArgs', () => {
  it('defaults to a fetching dry run over the built-in roots', () => {
    expect(parsePruneWorktreesArgs([])).toEqual({
      apply: false,
      roots: null,
      fetch: true,
      json: false,
      base: 'origin/main',
    });
  });

  it('accepts repeated roots and rejects unknown flags', () => {
    expect(
      parsePruneWorktreesArgs(['--root=/a', '--root=/b', '--apply', '--no-fetch']).roots
    ).toEqual(['/a', '/b']);
    expect(() => parsePruneWorktreesArgs(['--force'])).toThrow();
  });
});

describe('planWorktreePrune on a real repository', () => {
  let fixture;
  let agents;

  beforeEach(() => {
    fixture = createTempRepo();
    agents = join(fixture.root, 'agents');
    mkdirSync(agents);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function addWorktree(name, args = ['--detach', 'main']) {
    const path = join(agents, name);
    fixture.sh(['worktree', 'add', '-q', path, ...args]);
    return realpathSync(path);
  }

  function outcomes(plan) {
    return Object.fromEntries(plan.rows.map((row) => [row.id, row.outcome]));
  }

  it('applies every guard and removes only clean, merged, unused, salvaged worktrees', () => {
    const { repo, sh, commit, root, pushMain } = fixture;
    const clean = addWorktree('clean');
    const dirty = addWorktree('dirty');
    writeFileSync(join(dirty, 'scratch.txt'), 'untracked');
    const unmerged = addWorktree('unmerged', ['-b', 'wt-ahead', 'main']);
    commit('ahead.txt', 'a', 'ahead of main', { cwd: unmerged });
    const inUse = addWorktree('in-use');
    const locked = addWorktree('locked');
    sh(['worktree', 'lock', '--reason', 'capture running', locked]);
    const evidence = addWorktree('evidence');
    mkdirSync(join(evidence, 'perf-profiles', 'run-1'), { recursive: true });
    writeFileSync(join(evidence, 'perf-profiles', 'run-1', 'trace.json'), '{}');
    commit('perf-profiles/evidence/run.json', '{}', 'committed evidence');
    pushMain();
    const trackedOnly = addWorktree('tracked-only');
    expect(existsSync(join(trackedOnly, 'perf-profiles', 'evidence', 'run.json'))).toBe(true);
    sh(['worktree', 'add', '-q', join(root, 'elsewhere'), '--detach', 'main']);

    const plan = planWorktreePrune({
      cwd: repo,
      roots: [agents],
      base: 'origin/main',
      processCwds: [{ pid: 424242, command: 'zsh', cwd: join(inUse, 'web') }],
    });

    expect(outcomes(plan)).toEqual({
      clean: 'remove',
      dirty: 'keep',
      unmerged: 'keep',
      'in-use': 'skip (in use)',
      locked: 'skip (locked)',
      evidence: 'keep',
      'tracked-only': 'remove',
    });
    const reasons = Object.fromEntries(plan.rows.map((row) => [row.id, row.reason]));
    expect(reasons.dirty).toBe('uncommitted changes: 1 path');
    expect(reasons.unmerged).toBe('unmerged: wt-ahead is 1 commit ahead of origin/main');
    expect(reasons['in-use']).toBe('pid 424242 zsh');
    expect(reasons.locked).toBe('capture running');
    expect(reasons.evidence).toBe(
      'unsalvaged evidence: perf-profiles/run-1/ — run worktrees:salvage first'
    );
    expect(plan.excluded.map((w) => w.reason).sort()).toEqual([
      'main checkout',
      'outside every root',
    ]);

    const removed = removeWorktree(
      plan.rows.find((row) => row.id === 'clean'),
      plan
    );
    expect(removed.outcome).toBe('removed');
    expect(existsSync(clean)).toBe(false);
    expect(sh(['worktree', 'list', '--porcelain'])).not.toContain(clean);
    expect(sh(['branch', '--list', 'wt-ahead'])).toContain('wt-ahead');
  });

  it('never considers the main checkout, even when a root contains it, nor the current worktree', () => {
    const { repo, root } = fixture;
    const clean = addWorktree('clean');

    const fromRoot = planWorktreePrune({
      cwd: repo,
      roots: [root],
      base: 'origin/main',
      processCwds: [],
    });
    expect(fromRoot.rows.map((row) => row.real)).toEqual([clean]);
    expect(fromRoot.excluded[0]).toMatchObject({ reason: 'main checkout' });

    const fromInside = planWorktreePrune({
      cwd: clean,
      roots: [agents],
      base: 'origin/main',
      processCwds: [],
    });
    expect(fromInside.rows).toEqual([]);
    expect(fromInside.excluded.map((w) => w.reason)).toContain('current worktree');
  });

  it('reports a worktree whose directory vanished as prunable rather than failing', () => {
    const { repo } = fixture;
    const gone = addWorktree('gone');
    rmSync(gone, { recursive: true, force: true });

    const plan = planWorktreePrune({
      cwd: repo,
      roots: [agents],
      base: 'origin/main',
      processCwds: [],
    });
    expect(outcomes(plan)).toEqual({ gone: 'prunable' });
  });
});
