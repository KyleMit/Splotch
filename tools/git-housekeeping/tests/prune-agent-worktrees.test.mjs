import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listProcessCwds } from '../lib/process-cwds.mjs';
import {
  parsePruneWorktreesArgs,
  planWorktreePrune,
  pruneAgentWorktrees,
  removeVanishedWorktree,
  removeWorktree,
} from '../prune-agent-worktrees.mjs';
import { createTempRepo, REAL_REPO_TEST_OPTIONS } from './fixtures/temp-repo.mjs';

const listing = (entries = []) => ({ ok: true, entries });
const failedListing = () => listProcessCwds({ readers: [() => []] });
const VANISHED = 'gitdir file points to non-existent location';

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

  it('reports a worktree whose directory vanished as prunable rather than failing', () => {
    const gone = addWorktree('gone');
    rmSync(gone, { recursive: true, force: true });

    const planned = plan();

    expect(outcomes(planned)).toEqual({ gone: 'prunable' });
    expect(reasons(planned).gone).toMatch(
      new RegExp(`^${VANISHED}; \\S+ holds detached [0-9a-f]{12}$`)
    );
  });

  it('keeps a vanished worktree while its entry is the only reference to a detached commit', () => {
    const { commit, sh } = fixture;
    const detached = addWorktree('detached');
    const only = commit('work.txt', 'the only copy', 'unmerged work, detached', { cwd: detached });
    const branched = addWorktree('branched', ['-b', 'wt-ahead', 'main']);
    commit('ahead.txt', 'a', 'unmerged work, on a branch', { cwd: branched });
    rmSync(detached, { recursive: true, force: true });
    rmSync(branched, { recursive: true, force: true });

    const planned = plan();

    expect(outcomes(planned)).toEqual({ detached: 'keep', branched: 'prunable' });
    expect(reasons(planned)).toEqual({
      detached: `${VANISHED}, and no ref holds detached ${only} — \`git branch <name> ${only}\` keeps its commits`,
      branched: `${VANISHED}; branch wt-ahead keeps its commits`,
    });

    sh(['branch', 'rescued', only]);

    expect(plan().rows.find((row) => row.id === 'detached')).toMatchObject({
      outcome: 'prunable',
      reason: `${VANISHED}; rescued holds detached ${only.slice(0, 12)}`,
    });
  });

  // `git worktree remove` deletes a directory that exists, ignored files and
  // all, so a plan that saw none must not be trusted once one is back.
  it('leaves a worktree whose directory came back after the plan was made', () => {
    const { root, sh } = fixture;
    const back = addWorktree('back');
    mkdirSync(join(back, 'perf-profiles', 'run-1'), { recursive: true });
    writeFileSync(join(back, 'perf-profiles', 'run-1', 'trace.json'), '{}');
    const away = join(root, 'unmounted');
    renameSync(back, away);
    const planned = plan();
    expect(outcomes(planned)).toEqual({ back: 'prunable' });
    renameSync(away, back);

    expect(removeVanishedWorktree(planned.rows[0], planned)).toEqual({
      outcome: 'kept',
      reason: 'no longer prunable — rerun to classify it again',
    });
    expect(existsSync(join(back, 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
    expect(sh(['worktree', 'list', '--porcelain'])).toContain(back);
  });

  it('leaves a vanished worktree whose commit lost its last ref after the plan was made', () => {
    const { commit, sh } = fixture;
    const detached = addWorktree('detached');
    const only = commit('work.txt', 'the only copy', 'unmerged work, detached', { cwd: detached });
    sh(['branch', 'rescued', only]);
    rmSync(detached, { recursive: true, force: true });
    const planned = plan();
    expect(outcomes(planned)).toEqual({ detached: 'prunable' });
    sh(['branch', '-D', 'rescued']);

    expect(removeVanishedWorktree(planned.rows[0], planned)).toEqual({
      outcome: 'kept',
      reason: `${VANISHED}, and no ref holds detached ${only} — \`git branch <name> ${only}\` keeps its commits`,
    });
    expect(sh(['worktree', 'list', '--porcelain'])).toContain(detached);
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

  it('drops only the vanished entries it planned, never one outside every root', async () => {
    const { repo, root, commit } = fixture;
    const merged = addDetachedWorktree(join(agents, 'merged'));
    const unmerged = addDetachedWorktree(join(agents, 'unmerged'));
    commit('work.txt', 'the only copy', 'unmerged work, detached', { cwd: unmerged });
    const outside = addDetachedWorktree(join(root, 'elsewhere'));
    for (const path of [merged, unmerged, outside]) rmSync(path, { recursive: true, force: true });

    const applied = await run(listing);

    expect(outcomes(applied)).toEqual({ merged: 'pruned', unmerged: 'kept' });
    expect(listedWorktrees().sort()).toEqual([unmerged, outside, realpathSync(repo)].sort());
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
