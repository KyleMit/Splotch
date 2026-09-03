import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cellId, parseBenchArgs, planCells } from '../bench/run-bench.mjs';
import { DECLINE_REASONS, judgeRequest } from '../bench/lib/handler.mjs';
import { renderReport } from '../bench/lib/report.mjs';
import {
  ANCHOR_TOLERANCE_LINES,
  countLocalCommands,
  matchesKey,
  normalizeUsage,
  scoreCell,
  summarize,
} from '../bench/lib/score.mjs';
import { loadSeeds, SEEDS_DIRECTORY, validateSeed } from '../bench/lib/seeds.mjs';

const KEY = {
  name: 'x',
  control: false,
  title: 'x',
  path: 'tools/a.mjs',
  lines: [10, 12],
  severity: 'suggestion',
  keywords: ['--slurp'],
};
const finding = (overrides) => ({
  path: 'tools/a.mjs',
  line: 11,
  startLine: null,
  side: 'RIGHT',
  severity: 'blocking',
  body: 'a defect',
  ...overrides,
});

describe('bench arguments and plan', () => {
  it('defaults to two repetitions and the Codex rival', () => {
    expect(parseBenchArgs([])).toMatchObject({
      rival: 'codex',
      reps: 2,
      base: 'main',
      validate: false,
    });
    expect(parseBenchArgs(['--seeds', 'a,b', '--reps', '1', '--rival', 'claude'])).toMatchObject({
      seeds: ['a', 'b'],
      reps: 1,
      rival: 'claude',
    });
    expect(() => parseBenchArgs(['--rival', 'gemini'])).toThrow(/rival/);
    expect(() => parseBenchArgs(['--reps', '0'])).toThrow(/reps/);
    expect(() => parseBenchArgs(['extra'])).toThrow();
  });

  // An interrupted overnight run should leave a complete first pass over every cell.
  it('orders cells repetition-major', () => {
    const seeds = [{ name: 'a' }, { name: 'b' }];
    const cells = planCells({ seeds, reps: 2 });
    expect(cells.map(cellId)).toEqual(['a__r1', 'b__r1', 'a__r2', 'b__r2']);
  });
});

describe('the bench as handler', () => {
  const session = '/tmp/splotch-rival-agent/s1';

  it('approves what stays inside the session and declines the rest', () => {
    const approve = (command) => judgeRequest({ command, why: 'x' }, { session });
    expect(approve('npx vitest run --config tools/vitest.config.mjs rival-agent/tests')).toEqual({
      approved: true,
    });
    expect(approve(`cat ${session}/packet/scope.json && npm run check > /dev/null`)).toEqual({
      approved: true,
    });
    expect(approve('git -C /Users/someone/Code/Splotch status')).toMatchObject({
      approved: false,
      reason: DECLINE_REASONS.outside,
    });
    expect(approve('touch /tmp/elsewhere')).toMatchObject({ reason: DECLINE_REASONS.outside });
    // The first Claude rival round: a redirect, an input redirect, and the home directory.
    for (const command of [
      'node -e "x" >/Users/someone/Code/Splotch/pwned.txt',
      'cat </Users/someone/Code/Splotch/web/.env',
      'cp package.json ~/Desktop/leak.json',
      'echo $HOME/x',
      'ls `echo /Users`',
      'true;/Users/someone/bin/x',
    ]) {
      expect(approve(command)).toMatchObject({ approved: false, reason: DECLINE_REASONS.outside });
    }
    expect(approve(`npm run check > ${session}/outputs/check.log 2>&1`)).toEqual({
      approved: true,
    });
    for (const command of [
      'curl -I https://example.com',
      'gh pr view 7',
      'npm run test:e2e -- flows.spec.ts',
      'pnpm add left-pad',
      'git push origin HEAD',
      'npm run perf:capture',
    ]) {
      expect(approve(command)).toMatchObject({ approved: false, reason: DECLINE_REASONS.hostOnly });
    }
  });
});

describe('scoring', () => {
  it('matches a finding by anchor within the tolerance or by a keyword on the same file', () => {
    expect(matchesKey(finding(), KEY)).toBe(true);
    expect(matchesKey(finding({ line: 12 + ANCHOR_TOLERANCE_LINES }), KEY)).toBe(true);
    expect(matchesKey(finding({ line: 13 + ANCHOR_TOLERANCE_LINES }), KEY)).toBe(false);
    expect(matchesKey(finding({ line: 40, startLine: 5 }), KEY)).toBe(true);
    expect(matchesKey(finding({ line: 90, body: 'missing --SLURP here' }), KEY)).toBe(true);
    expect(matchesKey(finding({ path: 'tools/b.mjs', body: 'missing --slurp' }), KEY)).toBe(false);
  });

  it('scores detection, the severity floor, and false positives', () => {
    expect(scoreCell({ key: KEY, findings: [] })).toMatchObject({
      detected: false,
      severityMet: false,
      falsePositives: 0,
    });
    const low = finding({ severity: 'nit' });
    expect(
      scoreCell({ key: KEY, findings: [low, finding({ path: 'other', line: 1 })] })
    ).toMatchObject({
      detected: true,
      severityMet: false,
      falsePositives: 1,
    });
    expect(scoreCell({ key: KEY, findings: [low, finding()] })).toMatchObject({
      detected: true,
      severityMet: true,
      falsePositives: 0,
    });
    expect(scoreCell({ key: { control: true }, findings: [finding()] })).toMatchObject({
      detected: null,
      falsePositives: 1,
    });
  });

  // Codex's input count already includes the cached share; Claude reports the cache beside it.
  it("normalizes both vendors' usage to one shape", () => {
    expect(
      normalizeUsage('codex', { input_tokens: 100, cached_input_tokens: 80, output_tokens: 5 })
    ).toEqual({ input: 100, cached: 80, output: 5 });
    expect(
      normalizeUsage('claude', {
        input_tokens: 20,
        cache_read_input_tokens: 70,
        cache_creation_input_tokens: 10,
        output_tokens: 5,
      })
    ).toEqual({ input: 100, cached: 80, output: 5 });
    expect(normalizeUsage('codex', undefined)).toEqual({ input: 0, cached: 0, output: 0 });
  });

  it("counts the rival's own commands and failures from either stream log", () => {
    const directory = mkdtempSync(join(tmpdir(), 'rival-bench-log-'));
    try {
      const codexLog = join(directory, 'codex.ndjson');
      writeFileSync(
        codexLog,
        [
          JSON.stringify({
            type: 'item.started',
            item: { type: 'command_execution', command: 'a' },
          }),
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'command_execution', exit_code: 0 },
          }),
          JSON.stringify({
            type: 'item.started',
            item: { type: 'command_execution', command: 'b' },
          }),
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'command_execution', exit_code: 1 },
          }),
          JSON.stringify({ type: 'item.started', item: { type: 'mcp_tool_call' } }),
          'not json',
        ].join('\n')
      );
      expect(countLocalCommands(codexLog, 'codex')).toEqual({ started: 2, failed: 1 });
      const claudeLog = join(directory, 'claude.ndjson');
      writeFileSync(
        claudeLog,
        [
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                { type: 'tool_use', id: 'b1', name: 'Bash' },
                { type: 'tool_use', id: 'r1', name: 'Read' },
                { type: 'tool_use', id: 'm1', name: 'mcp__broker__run' },
              ],
            },
          }),
          JSON.stringify({
            type: 'user',
            message: {
              content: [
                { type: 'tool_result', tool_use_id: 'b1', is_error: true, content: 'denied' },
                { type: 'tool_result', tool_use_id: 'r1', is_error: true, content: 'outside' },
                { type: 'tool_result', tool_use_id: 'm1', is_error: true, content: 'ended' },
              ],
            },
          }),
        ].join('\n')
      );
      expect(countLocalCommands(claudeLog, 'claude')).toEqual({ started: 1, failed: 1 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('summarizes per rival and renders a report without leaking table syntax', () => {
    const base = {
      turns: { approved: 1, declined: 1 },
      localCommands: { started: 4, failed: 1 },
      wallSeconds: 60,
      usage: { input: 1_000_000, cached: 900_000, output: 10_000 },
      unverified: 0,
      findingsCount: 1,
      decisions: [{ approved: false, reason: 'x', command: 'a | b' }],
    };
    const cells = [
      {
        seed: 's',
        rival: 'codex',
        rep: 1,
        control: false,
        score: { detected: true, severityMet: true, falsePositives: 0 },
        ...base,
      },
      {
        seed: 's',
        rival: 'claude',
        rep: 1,
        control: false,
        score: { detected: false, severityMet: false, falsePositives: 1 },
        ...base,
      },
      {
        seed: 'c',
        rival: 'codex',
        rep: 1,
        control: true,
        score: { detected: null, severityMet: null, falsePositives: 2 },
        ...base,
      },
      {
        seed: 'c',
        rival: 'claude',
        rep: 1,
        control: true,
        failed: 'exited 2',
        wallSeconds: 3,
      },
    ];
    const summary = summarize(cells);
    expect(summary).toMatchObject([
      { rival: 'codex', detected: 1, severityMet: 1, controlFalsePositives: 2, failedCells: 0 },
      {
        rival: 'claude',
        detected: 0,
        seededFalsePositives: 1,
        controlCells: 0,
        failedCells: 1,
      },
    ]);
    const report = renderReport({
      runId: 'r',
      startedAt: '2026-09-03T01:00:00.000Z',
      base: 'a'.repeat(40),
      rival: 'codex',
      model: 'm',
      effort: 'high',
      reps: 1,
      seeds: [{ control: false }, { control: true }],
      cells,
      summary,
    });
    expect(report).toContain('# Rival-agent bench — 2026-09-03');
    expect(report).toContain('| codex | 1/1 | 1/1 |');
    expect(report).toContain('| found |');
    expect(report).toContain('| missed |');
    expect(report).toContain('2 false');
    expect(report).toContain('failed: exited 2');
    expect(report).toContain('`a \\| b`');
  });
});

describe('the corpus', () => {
  it('loads every seed with a complete key, a patch, and a repro', () => {
    const seeds = loadSeeds();
    expect(seeds.length).toBeGreaterThanOrEqual(12);
    expect(seeds.filter((seed) => seed.control).length).toBeGreaterThanOrEqual(3);
    for (const seed of seeds) {
      expect(seed.directory.startsWith(SEEDS_DIRECTORY)).toBe(true);
      expect(seed.control || seed.key.lines[0] <= seed.key.lines[1]).toBe(true);
    }
    expect(() => loadSeeds(undefined, ['no-such-seed'])).toThrow(/no seed named/);
  });

  // Validation is the promise the bench makes before spending anything: a seed whose repro does
  // not fail on the seeded tree is dropped, never scored.
  it('validates a seed against its base in a throwaway repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'rival-bench-validate-'));
    try {
      const repo = join(root, 'repo');
      mkdirSync(repo);
      const git = (args) =>
        execFileSync('git', args, {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 't',
            GIT_AUTHOR_EMAIL: 't@t',
            GIT_COMMITTER_NAME: 't',
            GIT_COMMITTER_EMAIL: 't@t',
          },
        });
      git(['init', '-q', '-b', 'main']);
      writeFileSync(join(repo, 'x.mjs'), 'export const answer = () => 42;\n');
      git(['add', 'x.mjs']);
      git(['commit', '-q', '-m', 'one']);
      writeFileSync(join(repo, 'x.mjs'), 'export const answer = () => 41;\n');
      const patch = git(['diff']);
      git(['checkout', '--', 'x.mjs']);
      const seedDirectory = join(root, 'seed');
      mkdirSync(seedDirectory);
      writeFileSync(join(seedDirectory, 'seed.patch'), patch);
      writeFileSync(
        join(seedDirectory, 'repro.mjs'),
        "import { pathToFileURL } from 'node:url';\nimport { join } from 'node:path';\nconst { answer } = await import(pathToFileURL(join(process.cwd(), 'x.mjs')).href);\nif (answer() !== 42) throw new Error('off by one');\n"
      );
      const seed = {
        name: 'off-by-one',
        control: false,
        patchPath: join(seedDirectory, 'seed.patch'),
        reproPath: join(seedDirectory, 'repro.mjs'),
      };
      const base = git(['rev-parse', 'HEAD']).trim();
      expect(
        validateSeed({ repoRoot: repo, base, seed, directory: join(root, 'wt') })
      ).toMatchObject({ ok: true, beforeStatus: 0, afterStatus: 1 });
      expect(
        validateSeed({
          repoRoot: repo,
          base,
          seed: { ...seed, control: true },
          directory: join(root, 'wt2'),
        })
      ).toMatchObject({ ok: false });
      expect(git(['worktree', 'list'])).not.toContain('wt');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
