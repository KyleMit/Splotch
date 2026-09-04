import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseIgnoredPaths,
  partitionIgnoredPaths,
  SALVAGE_PREFIXES,
} from '../lib/agent-worktrees.mjs';
import { moveTree, parseSalvageArgs, planSalvage } from '../salvage-worktree-evidence.mjs';
import { createTempRepo } from './fixtures/temp-repo.mjs';

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
  it('reads only the !! lines of porcelain status', () => {
    expect(
      parseIgnoredPaths('!! node_modules/\n M tracked.txt\n?? new.txt\n!! perf-profiles/\n')
    ).toEqual(['node_modules/', 'perf-profiles/']);
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

describe('planSalvage and moveTree on a real repository', () => {
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

  it('plans the allowlisted ignored paths out, reports the rest as left, and moves on apply', () => {
    const { repo, sh } = fixture;
    const wt = join(agents, 'wt1');
    sh(['worktree', 'add', '-q', wt, '--detach', 'main']);
    const real = realpathSync(wt);
    mkdirSync(join(real, 'perf-profiles', 'run-1'), { recursive: true });
    writeFileSync(join(real, 'perf-profiles', 'run-1', 'trace.json'), '{}');
    mkdirSync(join(real, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(real, 'node_modules', 'pkg', 'index.js'), '');
    const empty = join(agents, 'wt2');
    sh(['worktree', 'add', '-q', empty, '--detach', 'main']);

    const plan = planSalvage({ cwd: repo, roots: [agents], dest });
    expect(plan.rows).toEqual([
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

    const [salvage] = plan.rows;
    moveTree(salvage.from, salvage.to);
    expect(existsSync(join(dest, 'wt1', 'perf-profiles', 'run-1', 'trace.json'))).toBe(true);
    expect(existsSync(join(real, 'perf-profiles', 'run-1'))).toBe(false);
    expect(existsSync(join(real, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  it('refuses to plan over an existing destination', () => {
    const { repo, sh } = fixture;
    const wt = join(agents, 'wt1');
    sh(['worktree', 'add', '-q', wt, '--detach', 'main']);
    const real = realpathSync(wt);
    mkdirSync(join(real, 'tools', 'redteam', 'output'), { recursive: true });
    writeFileSync(join(real, 'tools', 'redteam', 'output', 'report.md'), 'x');
    mkdirSync(join(dest, 'wt1', 'tools', 'redteam', 'output'), { recursive: true });

    const plan = planSalvage({ cwd: repo, roots: [agents], dest });
    expect(plan.rows.map((row) => [row.path, row.outcome])).toEqual([
      ['tools/redteam/output/', 'conflict'],
    ]);
  });
});
