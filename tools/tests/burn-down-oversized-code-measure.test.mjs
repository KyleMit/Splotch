import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The burn-down-oversized-code measure script decides which files and functions
// a campaign touches and which per-file caps it retires, so its thresholds are
// the campaign's scope. Every generated copy is exercised, because each is a
// script an agent is told to run and its tools/lib import is relative.
const repoRoot = join(import.meta.dirname, '..', '..');
const COPIES = [
  '.ruler/skills/burn-down-oversized-code/measure.mjs',
  '.claude/skills/burn-down-oversized-code/measure.mjs',
  '.agents/skills/burn-down-oversized-code/measure.mjs',
];

const modules = await Promise.all(
  COPIES.map(async (path) => ({
    path,
    module: await import(pathToFileURL(join(repoRoot, path)).href),
  }))
);

const eslintConfig = (await import(pathToFileURL(join(repoRoot, 'eslint.config.js')).href)).default;

describe.each(modules)('burn-down-oversized-code measure $path', ({ path, module }) => {
  const { MODES, assess, findRuleBlocks, parseArgs, parseMessage } = module;

  it('exits 2 on an unknown option instead of measuring anyway', () => {
    const run = spawnSync(process.execPath, [join(repoRoot, path), 'files', '--fix'], {
      encoding: 'utf8',
    });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain('Unknown option(s): --fix');
  });

  it('requires exactly one known mode', () => {
    expect(parseArgs([]).error).toMatch(/^Usage/);
    expect(parseArgs(['lines']).error).toMatch(/^Usage/);
    expect(parseArgs(['files', 'functions']).error).toMatch(/^Usage/);
    expect(parseArgs(['functions', '--json'])).toEqual({
      mode: 'functions',
      json: true,
      check: false,
    });
  });

  it('reads the count and subject out of both size rules’ messages', () => {
    expect(parseMessage('File has too many lines (429). Maximum allowed is 1.')).toEqual({
      subject: 'File',
      lines: 429,
    });
    expect(
      parseMessage("Function 'createParentalGate' has too many lines (251). Maximum allowed is 1.")
    ).toEqual({ subject: "Function 'createParentalGate'", lines: 251 });
  });

  it('throws on a message it cannot read rather than dropping the unit', () => {
    expect(() => parseMessage('Line 3 exceeds the maximum length')).toThrow(/Unrecognised/);
  });

  describe('findRuleBlocks', () => {
    const block = (files, max) => ({ files, rules: { 'max-lines': ['error', { max }] } });

    it('separates the glob-scoped default from literal per-file overrides', () => {
      const config = [[block(['src/**'], 500)], block(['src/big.ts'], 900), { rules: {} }];

      expect(findRuleBlocks(config, 'max-lines')).toEqual({
        scope: ['src/**'],
        options: { max: 500 },
        defaultCap: 500,
        overrides: [{ path: 'src/big.ts', cap: 900 }],
      });
    });

    it('refuses a config with no single default block', () => {
      expect(() => findRuleBlocks([block(['a.ts'], 9)], 'max-lines')).toThrow(/found 0/);
      expect(() =>
        findRuleBlocks([block(['src/**'], 500), block(['web/**'], 400)], 'max-lines')
      ).toThrow(/found 2/);
    });
  });

  describe('assess', () => {
    const headroomLines = 25;
    const defaultCap = 125;
    const capsByPath = new Map([
      ['a.ts', 125],
      ['gate.ts', 276],
    ]);
    const run = (units, overrides = []) =>
      assess({ units, capsByPath, overrides, defaultCap, headroomLines });

    it('flags a unit only once it is inside the headroom band', () => {
      const { candidates } = run([
        { path: 'a.ts', name: 'atTarget', lines: 100 },
        { path: 'a.ts', name: 'overTarget', lines: 101 },
      ]);

      expect(candidates.map((u) => u.name)).toEqual(['overTarget']);
      expect(candidates[0].cap).toBe(125);
    });

    it('keeps an override that grants roughly one raise worth of room', () => {
      const { staleOverrides } = run(
        [{ path: 'gate.ts', lines: 251 }],
        [{ path: 'gate.ts', cap: 276 }]
      );

      expect(staleOverrides).toEqual([]);
    });

    it('lowers an override once the file has shrunk well under it', () => {
      const { staleOverrides } = run(
        [{ path: 'gate.ts', lines: 200 }],
        [{ path: 'gate.ts', cap: 276 }]
      );

      expect(staleOverrides).toEqual([
        { path: 'gate.ts', cap: 276, longest: 200, action: 'lower to 225' },
      ]);
    });

    it('retires an override whose file is back under the soft target or gone', () => {
      const { staleOverrides } = run(
        [{ path: 'gate.ts', lines: 90 }],
        [
          { path: 'gate.ts', cap: 276 },
          { path: 'deleted.ts', cap: 300 },
        ]
      );

      expect(staleOverrides.map((o) => [o.path, o.action])).toEqual([
        ['gate.ts', 'retire'],
        ['deleted.ts', 'retire'],
      ]);
    });
  });

  it.each(Object.entries(MODES))(
    'finds one default %s block in the real eslint.config.js',
    (_mode, { rule }) => {
      const { defaultCap, overrides } = findRuleBlocks(eslintConfig, rule);

      expect(defaultCap).toBeGreaterThan(0);
      expect(overrides.every((o) => o.cap > defaultCap)).toBe(true);
    }
  );
});
