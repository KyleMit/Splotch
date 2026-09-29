import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listProcessCwds } from '../lib/process-cwds.mjs';
import {
  parsePruneWorktreesArgs,
  planWorktreePrune,
  pruneAgentWorktrees,
  removeWorktree,
} from '../prune-agent-worktrees.mjs';
import { createTempRepo, REAL_REPO_TEST_OPTIONS } from './fixtures/temp-repo.mjs';

const listing = (entries = []) => ({ ok: true, entries });
const failedListing = () => listProcessCwds({ readers: [() => []] });
const VANISHED = 'gitdir file points to non-existent location';
const VANISHED_REASON = `${VANISHED}; its entry holds this worktree's HEAD and reflog, which can be a commit's only reference`;

function outcomes(plan) {
  return Object.fromEntries(plan.rows.map((row) => [row.id, row.outcome]));
}

function reasons(plan) {
  return Object.fromEntries(plan.rows.map((row) => [row.id, row.reason]));
}

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

describe('planWorktreePrune on a real repository', REAL_REPO_TEST_OPTIONS, () => {
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

  function plan(processCwds = listing()) {
    return planWorktreePrune({
      cwd: fixture.repo,
      roots: [agents],
      base: 'origin/main',
      processCwds,
    });
  }

  it('applies every guard and removes only clean, merged, unused, salvaged worktrees', () => {
    const { sh, commit, root, pushMain } = fixture;
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

    const planned = plan(listing([{ pid: 424242, command: 'zsh', cwd: join(inUse, 'web') }]));

    expect(outcomes(planned)).toEqual({
      clean: 'remove',
      dirty: 'keep',
      unmerged: 'keep',
      'in-use': 'skip (in use)',
      locked: 'skip (locked)',
      evidence: 'keep',
      'tracked-only': 'remove',
    });
    expect(reasons(planned)).toMatchObject({
      dirty: 'uncommitted changes: 1 path',
      unmerged: 'unmerged: wt-ahead is 1 commit ahead of origin/main',
      'in-use': 'pid 424242 zsh',
      locked: 'capture running',
      evidence: 'unsalvaged evidence: perf-profiles/run-1/ — run worktrees:salvage first',
    });
    expect(planned.excluded.map((w) => w.reason).sort()).toEqual([
      'main checkout',
      'outside every root',
    ]);

    const removed = removeWorktree(
      planned.rows.find((row) => row.id === 'clean'),
      { ...planned, listCwds: listing }
    );
    expect(removed.outcome).toBe('removed');
    expect(existsSync(clean)).toBe(false);
    expect(sh(['worktree', 'list', '--porcelain'])).not.toContain(clean);
    expect(sh(['branch', '--list', 'wt-ahead'])).toContain('wt-ahead');
  });

  it('keeps a worktree whose unsalvaged evidence has a name git would quote', () => {
    const evidence = addWorktree('evidence');
    for (const name of ['run 2', 'café-run']) {
      mkdirSync(join(evidence, 'perf-profiles', name), { recursive: true });
      writeFileSync(join(evidence, 'perf-profiles', name, 'trace.json'), '{}');
    }

    const planned = plan();

    expect(outcomes(planned)).toEqual({ evidence: 'keep' });
    expect(reasons(planned).evidence.normalize('NFC')).toBe(
      'unsalvaged evidence: perf-profiles/café-run/, perf-profiles/run 2/ — run worktrees:salvage first'
    );
  });

  it('skips every unlocked worktree when the process listing failed', () => {
    const { sh } = fixture;
    addWorktree('clean');
    const locked = addWorktree('locked');
    sh(['worktree', 'lock', '--reason', 'capture running', locked]);

    const planned = plan(failedListing());

    expect(outcomes(planned)).toEqual({ clean: 'skip (use unknown)', locked: 'skip (locked)' });
    expect(reasons(planned).clean).toBe(
      'no process listing names this process, so none can be trusted'
    );
  });

  it('never considers the main checkout, even when a root contains it, nor the current worktree', () => {
    const { repo, root } = fixture;
    const clean = addWorktree('clean');

    const fromRoot = planWorktreePrune({
      cwd: repo,
      roots: [root],
      base: 'origin/main',
      processCwds: listing(),
    });
    expect(fromRoot.rows.map((row) => row.real)).toEqual([clean]);
    expect(fromRoot.excluded[0]).toMatchObject({ reason: 'main checkout' });

    const fromInside = planWorktreePrune({
      cwd: clean,
      roots: [agents],
      base: 'origin/main',
      processCwds: listing(),
    });
    expect(fromInside.rows).toEqual([]);
    expect(fromInside.excluded.map((w) => w.reason)).toContain('current worktree');
  });

  it('keeps every worktree whose directory vanished, merged or not, detached or on a branch', () => {
    const { commit } = fixture;
    const merged = addWorktree('merged');
    const detached = addWorktree('detached');
    commit('work.txt', 'the only copy', 'unmerged work, detached', { cwd: detached });
    const branched = addWorktree('branched', ['-b', 'wt-ahead', 'main']);
    for (const path of [merged, detached, branched]) rmSync(path, { recursive: true, force: true });

    const planned = plan();

    expect(outcomes(planned)).toEqual({ merged: 'keep', detached: 'keep', branched: 'keep' });
    expect(new Set(Object.values(reasons(planned)))).toEqual(new Set([VANISHED_REASON]));
  });
});

describe('pruneAgentWorktrees --apply on a real repository', REAL_REPO_TEST_OPTIONS, () => {
  let fixture;
  let agents;
  let notes;
  let exitCodeBefore;

  beforeEach(() => {
    fixture = createTempRepo();
    agents = join(fixture.root, 'agents');
    mkdirSync(agents);
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    notes = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = exitCodeBefore;
    fixture.cleanup();
  });

  function addDetachedWorktree(path) {
    fixture.sh(['worktree', 'add', '-q', path, '--detach', 'main']);
    return realpathSync(path);
  }

  function run(listCwds, { apply = true } = {}) {
    return pruneAgentWorktrees(
      { apply, roots: [agents], fetch: false, json: false, base: 'origin/main' },
      { cwd: fixture.repo, listCwds }
    );
  }

  function listedWorktrees() {
    return fixture
      .sh(['worktree', 'list', '--porcelain'])
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length));
  }

  // Each entry below is the only reference to something: a commit left only in
  // the HEAD reflog by a reset, a HEAD naming a branch that was deleted, or a
  // worktree outside every root, which this script promises never to touch.
  it('leaves every vanished entry in place, inside the roots and outside them', async () => {
    const { repo, root, commit, sh } = fixture;
    const merged = addDetachedWorktree(join(agents, 'merged'));
    const reset = addDetachedWorktree(join(agents, 'reset'));
    commit('work.txt', 'the only copy', 'unmerged work, then reset away', { cwd: reset });
    sh(['reset', '-q', '--hard', 'main'], { cwd: reset });
    const branch = join(agents, 'deleted-branch');
    sh(['worktree', 'add', '-q', '-b', 'doomed', branch, 'main']);
    const branchReal = realpathSync(branch);
    sh(['update-ref', '-d', 'refs/heads/doomed']);
    const outside = addDetachedWorktree(join(root, 'elsewhere'));
    const vanished = [merged, reset, branchReal, outside];
    for (const path of vanished) rmSync(path, { recursive: true, force: true });

    const applied = await run(listing);

    expect(outcomes(applied)).toEqual({
      merged: 'kept',
      reset: 'kept',
      'deleted-branch': 'kept',
    });
    expect(listedWorktrees().sort()).toEqual([realpathSync(repo), ...vanished].sort());
    expect(process.exitCode).toBeUndefined();
  });

  it('removes nothing and exits 1 when the process listing failed', async () => {
    const clean = addDetachedWorktree(join(agents, 'clean'));

    const applied = await run(failedListing);

    expect(outcomes(applied)).toEqual({ clean: 'skip (use unknown)' });
    expect(existsSync(clean)).toBe(true);
    expect(listedWorktrees()).toContain(clean);
    expect(process.exitCode).toBe(1);
    expect(notes.mock.calls.flat().join('')).toContain(
      'Cannot tell which worktrees are in use: no process listing names this process, so none can be trusted. The listing needs `lsof` on PATH (macOS keeps it in /usr/sbin;'
    );
  });

  it('removes nothing and exits 1 when the listing fails after the plan was made', async () => {
    const clean = addDetachedWorktree(join(agents, 'clean'));
    const listings = [listing(), failedListing()];

    const applied = await run(() => listings.shift());

    expect(outcomes(applied)).toEqual({ clean: 'skip (use unknown)' });
    expect(existsSync(clean)).toBe(true);
    expect(process.exitCode).toBe(1);
    expect(notes.mock.calls.flat().join('')).toContain('Cannot tell which worktrees are in use');
  });

  it('warns about a failed process listing on a dry run without failing it', async () => {
    addDetachedWorktree(join(agents, 'clean'));

    const planned = await run(failedListing, { apply: false });

    expect(outcomes(planned)).toEqual({ clean: 'skip (use unknown)' });
    expect(process.exitCode).toBeUndefined();
    expect(notes.mock.calls.flat().join('')).toContain('Cannot tell which worktrees are in use');
  });
});
