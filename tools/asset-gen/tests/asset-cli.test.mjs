import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  parseNonNegative,
  parsePngToWebpOptions,
  parsePositiveInt,
  parseTemperature,
} from '../lib/asset-cli.mjs';
import { makeClient } from '../lib/gemini.mjs';

let error;
let exit;

beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process exited');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function expectFailure(parse, raw, name, fallback, source, message) {
  expect(() => parse(raw, name, fallback, source)).toThrow('process exited');
  expect(error).toHaveBeenCalledWith(message);
  expect(exit).toHaveBeenCalledWith(1);
}

describe('parsePositiveInt', () => {
  it('returns the fallback for an omitted value and parses positive integer strings', () => {
    expect(parsePositiveInt(undefined, '--samples', 3)).toBe(3);
    expect(parsePositiveInt('', '--samples', 3)).toBe(3);
    expect(parsePositiveInt('   ', '--samples', 3)).toBe(3);
    expect(parsePositiveInt('1', '--samples', 3)).toBe(1);
    expect(parsePositiveInt('12', '--samples', 3)).toBe(12);
  });

  it.each(['nope', '0', '-1', '1.5'])('rejects invalid positive integers: %s', (raw) => {
    expectFailure(
      parsePositiveInt,
      raw,
      '--samples',
      3,
      undefined,
      `--samples must be a positive integer, got "${raw}"`
    );
  });
});

describe('parseTemperature', () => {
  it('returns the fallback and accepts numeric strings at both bounds', () => {
    expect(parseTemperature(undefined, '--temperature', 0.5)).toBe(0.5);
    expect(parseTemperature('', '--temperature', 0.5)).toBe(0.5);
    expect(parseTemperature('  \t ', '--temperature', 0.5)).toBe(0.5);
    expect(parseTemperature(undefined, '--temperature', undefined)).toBeUndefined();
    expect(parseTemperature('0', '--temperature', 0.5)).toBe(0);
    expect(parseTemperature('1.25', '--temperature', 0.5)).toBe(1.25);
    expect(parseTemperature('2', '--temperature', 0.5)).toBe(2);
  });

  it.each(['nope', '-0.1', '2.1'])('rejects invalid temperatures: %s', (raw) => {
    expectFailure(
      parseTemperature,
      raw,
      '--temperature',
      0.5,
      undefined,
      `--temperature must be a number between 0 and 2, got "${raw}"`
    );
  });
});

describe('parseNonNegative', () => {
  it('returns the fallback and accepts non-negative numeric strings', () => {
    expect(parseNonNegative(undefined, '--threshold', 2)).toBe(2);
    expect(parseNonNegative('', '--threshold', 2)).toBe(2);
    expect(parseNonNegative('   ', '--threshold', 2)).toBe(2);
    expect(parseNonNegative('0', '--threshold', 2)).toBe(0);
    expect(parseNonNegative('1.5', '--threshold', 2)).toBe(1.5);
  });

  it.each(['nope', '-0.1'])('rejects invalid non-negative numbers: %s', (raw) => {
    expectFailure(
      parseNonNegative,
      raw,
      '--threshold',
      2,
      'page via notes.json',
      `--threshold must be a non-negative number, got "${raw}" (page via notes.json)`
    );
  });
});

describe('parsePngToWebpOptions', () => {
  it('uses defaults and environment compatibility fallbacks', () => {
    expect(parsePngToWebpOptions([], {})).toEqual({ quality: 80, lossless: false });
    expect(parsePngToWebpOptions([], { QUALITY: '90', LOSSLESS: '1' })).toEqual({
      quality: 90,
      lossless: true,
    });
  });

  // An exported-but-empty env var arrives as '' rather than undefined, and
  // Number('') is 0 — which would silently ship maximally-destroyed webp output.
  // Number() reads an all-whitespace string the same way, so templating or shell
  // interpolation leaving a stray space is the same failure with no visible cause.
  it.each(['', '   ', '\t\n'])('treats a blank environment quality (%j) as unset', (quality) => {
    expect(parsePngToWebpOptions([], { QUALITY: quality })).toEqual({
      quality: 80,
      lossless: false,
    });
  });

  // notes.json carries real JSON numbers, so the blank check must not assume a
  // string — trimming one would throw rather than parse.
  it('parses a non-string numeric value from the notes registry', () => {
    expect(parseTemperature(0.45, '--temperature', 0.5)).toBe(0.45);
    expect(parsePositiveInt(4, '--max-attempts', 3)).toBe(4);
    expect(parseNonNegative(0, '--threshold', 2)).toBe(0);
  });

  it('parses flags with precedence over environment fallbacks', () => {
    expect(
      parsePngToWebpOptions(['--quality', '95', '--lossless'], {
        QUALITY: '70',
        LOSSLESS: '0',
      })
    ).toEqual({ quality: 95, lossless: true });
  });

  it('rejects an invalid environment quality fallback', () => {
    expect(() => parsePngToWebpOptions([], { QUALITY: 'invalid' })).toThrow('process exited');
    expect(error).toHaveBeenCalledWith('--quality must be a non-negative number, got "invalid"');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('makeClient', () => {
  it('fails with the canonical diagnostic when the key is required but absent', () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);

    expect(() => makeClient()).toThrow('process exited');
    expect(error).toHaveBeenCalledWith('GEMINI_API_KEY is not set.');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('returns null when the key is optional and absent', () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);

    expect(makeClient({ optional: true })).toBeNull();
  });
});

const commandCases = [
  [
    'gen-light-fills.mjs',
    ['--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'normalize-outline-strokes.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-fresh-outlines.mjs',
    ['nature/ant-tall', '--scene', 'test', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-style-covers.mjs',
    ['--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  ['gen-light-fills.mjs', ['--samples', '1.5'], '--samples must be a positive integer, got "1.5"'],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--dry-run', '--samples', '1.5'],
    '--samples must be a positive integer, got "1.5"',
  ],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'normalize-outline-strokes.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-fresh-outlines.mjs',
    ['nature/ant-tall', '--scene', 'test', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--dry-run', '--drift-threshold', 'invalid'],
    '--drift-threshold must be a non-negative number, got "invalid"',
  ],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--dry-run', '--halo-score-max', 'invalid'],
    '--halo-score-max must be a non-negative number, got "invalid"',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--dry-run', '--invented-max', 'invalid'],
    '--invented-max must be a non-negative number, got "invalid"',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--dry-run', '--ink-diff-max', 'invalid'],
    '--ink-diff-max must be a non-negative number, got "invalid"',
  ],
];

const entryPath = (script) =>
  join(
    import.meta.dirname,
    '..',
    script === 'gen-style-covers.mjs' ? 'style-covers' : 'coloring',
    script
  );

it.each(commandCases)('%s uses the canonical numeric diagnostic', (script, args, expected) => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', entryPath(script), ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, GEMINI_API_KEY: 'test', NODE_NO_WARNINGS: '1' },
    }
  );

  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe(expected);
});

const offlineCommandCases = [
  ['gen-night-fills.mjs', ['--dry-run'], 'give a category or page, e.g. "space"'],
  [
    'gen-night-fills.mjs',
    ['nature/ant-tall', '--apply', '--samples', '2'],
    '--apply cannot be combined with --samples greater than 1.',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-chalk-outlines.mjs',
    ['nature/ant-tall', '--rescore', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'normalize-outline-strokes.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
];

it.each(offlineCommandCases)('%s keeps its offline mode key-optional', (script, args, expected) => {
  const env = { ...process.env, NODE_NO_WARNINGS: '1' };
  delete env.GEMINI_API_KEY;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', entryPath(script), ...args],
    { encoding: 'utf8', env }
  );

  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe(expected);
});

it('night fill rescore runs without an API key and reports a missing saved candidate', () => {
  const env = { ...process.env, NODE_NO_WARNINGS: '1' };
  delete env.GEMINI_API_KEY;
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      entryPath('gen-night-fills.mjs'),
      'nature/ant-tall',
      '--rescore',
    ],
    { encoding: 'utf8', env }
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('(skip) no candidate to rescore');
  expect(result.stderr).toBe('');
});

it('night fill rescore refuses apply when a requested saved candidate is missing', () => {
  const env = { ...process.env, NODE_NO_WARNINGS: '1' };
  delete env.GEMINI_API_KEY;
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      entryPath('gen-night-fills.mjs'),
      'nature/ant-tall',
      '--rescore',
      '--apply',
    ],
    { encoding: 'utf8', env }
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('(skip) no candidate to rescore');
  expect(result.stderr.trim()).toBe('1 render(s) failed.');
});
