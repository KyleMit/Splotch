import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseIgnoredPaths,
  partitionIgnoredPaths,
  SALVAGE_PREFIXES,
  stillHeld,
} from '../lib/agent-worktrees.mjs';
import { listProcessCwds } from '../lib/process-cwds.mjs';
import {
  moveTree,
  parseSalvageArgs,
  planSalvage,
  salvageWorktreeEvidence,
} from '../salvage-worktree-evidence.mjs';
import { createTempRepo, REAL_REPO_TEST_OPTIONS } from './fixtures/temp-repo.mjs';

const listing = (entries = []) => ({ ok: true, entries });
const failedListing = () => listProcessCwds({ readers: [() => []] });

describe('parseSalvageArgs', () => {
  it('defaults to a dry run into the shared evidence directory', () => {
    const parsed = parseSalvageArgs([]);
    expect(parsed).toMatchObject({ apply: false, roots: null, json: false });
    expect(parsed.dest).toMatch(/splotch-worktree-evidence$/);
    expect(parseSalvageArgs(['--dest=/x', '--root=/r']).dest).toBe('/x');
    expect(() => parseSalvageArgs(['--move'])).toThrow();
  });
});

describe('ignored-path partitioning', () => {
  it('reads only the !! entries of NUL-separated porcelain status', () => {
    expect(
      parseIgnoredPaths(
        '!! node_modules/\0 M tracked.txt\0?? new.txt\0!! perf-profiles/run 2/\0!! perf-profiles/café/\0'
      )
    ).toEqual(['node_modules/', 'perf-profiles/run 2/', 'perf-profiles/café/']);
  });

  it('never reads the origin path of a rename or a copy as an entry', () => {
    expect(
      parseIgnoredPaths(
        'R  moved.txt\0!! perf-profiles/renamed-from/\0 C copy.txt\0!! perf-profiles/copied-from/\0!! perf-profiles/run-1/\0'
      )
    ).toEqual(['perf-profiles/run-1/']);
  });

  it('keeps allowlisted prefixes and their children, leaves everything else', () => {
    const paths = [
      'node_modules/',
      'perf-profiles/',
      'perf-profiles/run-1/',
      'tools/redteam/decrypted/secret.json',
      'tools/redteam/output/',
      'tools/redteam/README-local.md',
      'web/.env',
    ];
    expect(partitionIgnoredPaths(paths, SALVAGE_PREFIXES)).toEqual({
      salvage: [
        'perf-profiles/',
        'perf-profiles/run-1/',
        'tools/redteam/decrypted/secret.json',
        'tools/redteam/output/',
      ],
      disposable: ['node_modules/', 'tools/redteam/README-local.md', 'web/.env'],
    });
  });
});

describe('planSalvage and moveTree on a real repository', REAL_REPO_TEST_OPTIONS, () => {
  let fixture;
  let agents;
  let dest;

  beforeEach(() => {
    fixture = createTempRepo();
    agents = join(fixture.root, 'agents');
    dest = join(fixture.root, 'evidence');
    mkdirSync(agents);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function addWorktree(name) {
    const path = join(agents, name);
    fixture.sh(['worktree', 'add', '-q', path, '--detach', 'main']);
    return realpathSync(path);
  }

  function addCapture(worktree, name) {
    mkdirSync(join(worktree, 'perf-profiles', name), { recursive: true });
    writeFileSync(join(worktree, 'perf-profiles', name, 'trace.json'), '{}');
  }

  function plan(processCwds = listing()) {
    return planSalvage({ cwd: fixture.repo, roots: [agents], dest, processCwds });
  }

  it('plans the allowlisted ignored paths out, reports the rest as left, and moves on apply', () => {
    const real = addWorktree('wt1');
    addCapture(real, 'run-1');
    mkdirSync(join(real, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(real, 'node_modules', 'pkg', 'index.js'), '');
    addWorktree('wt2');

    const planned = plan();
    expect(planned.rows).toEqual([
      {
        worktree: real,
        id: 'wt1',
        path: 'perf-profiles/run-1/',
        from: join(real, 'perf-profiles/run-1/'),
        to: join(dest, 'wt1', 'perf-profiles/run-1/'),
        outcome: 'salvage',
        reason: `→ ${join(dest, 'wt1', 'perf-profiles/run-1/')}`,
      },
      {
        worktree: real,
        id: 'wt1',
        path: null,
        disposable: ['node_modules/'],
        outcome: 'leave',
        reason: 'node_modules/',
      },
    ]);

    const [salvage] = planned.rows;
    moveTree(salvage.from, salvage.to);
    expect(existsSync(join(dest, 'wt1', 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
    expect(existsSync(join(real, 'perf-profiles', 'run-1'))).toBe(false);
    expect(existsSync(join(real, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  it('plans evidence out under the name it has, when git would quote that name', () => {
    const real = addWorktree('wt1');
    addCapture(real, 'run 2');
    addCapture(real, 'café-run');

    const planned = plan();

    expect(planned.rows.map((row) => [row.path.normalize('NFC'), row.outcome])).toEqual([
      ['perf-profiles/café-run/', 'salvage'],
      ['perf-profiles/run 2/', 'salvage'],
    ]);
    expect(planned.rows.every((row) => existsSync(row.from))).toBe(true);
  });

  // The prune's never-touch set is the salvage's too: moving a capture's output
  // out from under a running session splits the run, and a cross-filesystem
  // move deletes the source after copying.
  it('skips a locked worktree and one a process is sitting in, without planning a move', () => {
    const { sh } = fixture;
    const lockedReal = addWorktree('locked');
    addCapture(lockedReal, 'live');
    sh(['worktree', 'lock', '--reason', 'capture running', lockedReal]);
    const busyReal = addWorktree('busy');
    addCapture(busyReal, 'run-1');

    const planned = plan(
      listing([{ pid: 424242, command: 'node', cwd: join(busyReal, 'perf-profiles') }])
    );

    expect(planned.rows.map((row) => [row.id, row.outcome, row.reason])).toEqual([
      ['busy', 'skip (in use)', 'pid 424242 node'],
      ['locked', 'skip (locked)', 'capture running'],
    ]);
    expect(planned.rows.every((row) => row.path === null)).toBe(true);
    expect(existsSync(join(lockedReal, 'perf-profiles', 'live', 'trace.json'))).toBe(true);
    expect(existsSync(join(busyReal, 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
  });

  // The recheck has to re-read git, not reuse the plan's snapshot: a capture can
  // lock the worktree in the window between planning and moving.
  it('sees a lock acquired after the plan was made', () => {
    const { repo, sh } = fixture;
    const real = addWorktree('cap');
    addCapture(real, 'live');

    expect(plan().rows.map((row) => row.outcome)).toContain('salvage');
    expect(stillHeld(real, repo, listing)).toBeNull();

    sh(['worktree', 'lock', '--reason', 'capture reserved', real]);
    expect(stillHeld(real, repo, listing)).toEqual({
      outcome: 'skip (locked)',
      reason: 'capture reserved',
    });
  });

  it('holds a worktree when the listing fails between the plan and the move', () => {
    const real = addWorktree('cap');

    expect(stillHeld(real, fixture.repo, failedListing)).toEqual({
      outcome: 'skip (use unknown)',
      reason: 'no process listing names this process, so none can be trusted',
    });
  });

  it('refuses to plan over an existing destination', () => {
    const real = addWorktree('wt1');
    mkdirSync(join(real, 'tools', 'redteam', 'output'), { recursive: true });
    writeFileSync(join(real, 'tools', 'redteam', 'output', 'report.md'), 'x');
    mkdirSync(join(dest, 'wt1', 'tools', 'redteam', 'output'), { recursive: true });

    expect(plan().rows.map((row) => [row.path, row.outcome])).toEqual([
      ['tools/redteam/output/', 'conflict'],
    ]);
  });
});

describe('salvageWorktreeEvidence --apply on a real repository', REAL_REPO_TEST_OPTIONS, () => {
  let fixture;
  let agents;
  let dest;
  let notes;
  let exitCodeBefore;

  beforeEach(() => {
    fixture = createTempRepo();
    agents = join(fixture.root, 'agents');
    dest = join(fixture.root, 'evidence');
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

  function addWorktreeWithCaptures(name, captures) {
    const path = join(agents, name);
    fixture.sh(['worktree', 'add', '-q', path, '--detach', 'main']);
    const real = realpathSync(path);
    for (const capture of captures) {
      mkdirSync(join(real, 'perf-profiles', capture), { recursive: true });
      writeFileSync(join(real, 'perf-profiles', capture, 'trace.json'), '{}');
    }
    return real;
  }

  function run(listCwds) {
    return salvageWorktreeEvidence(
      { apply: true, roots: [agents], dest, json: false },
      { cwd: fixture.repo, listCwds }
    );
  }

  it('moves evidence whose name git would quote', async () => {
    const real = addWorktreeWithCaptures('wt1', ['run 2', 'café-run']);

    const applied = await run(listing);

    expect(applied.rows.map((row) => row.outcome)).toEqual(['salvaged', 'salvaged']);
    for (const capture of ['run 2', 'café-run']) {
      expect(existsSync(join(dest, 'wt1', 'perf-profiles', capture, 'trace.json'))).toBe(true);
      expect(existsSync(join(real, 'perf-profiles', capture))).toBe(false);
    }
    expect(process.exitCode).toBeUndefined();
  });

  it('moves nothing and exits 1 when the process listing failed', async () => {
    const real = addWorktreeWithCaptures('wt1', ['run-1']);

    const applied = await run(failedListing);

    expect(applied.rows.map((row) => [row.id, row.outcome, row.path])).toEqual([
      ['wt1', 'skip (use unknown)', null],
    ]);
    expect(existsSync(join(real, 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
    expect(existsSync(dest)).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(notes.mock.calls.flat().join('')).toContain(
      'Cannot tell which worktrees are in use: no process listing names this process, so none can be trusted. The listing needs `lsof` on PATH (macOS keeps it in /usr/sbin;'
    );
  });

  it('moves nothing and exits 1 when the listing fails after the plan was made', async () => {
    const real = addWorktreeWithCaptures('wt1', ['run-1']);
    const listings = [listing(), failedListing()];

    const applied = await run(() => listings.shift());

    expect(applied.rows.map((row) => [row.path, row.outcome])).toEqual([
      ['perf-profiles/run-1/', 'skip (use unknown)'],
    ]);
    expect(existsSync(join(real, 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
