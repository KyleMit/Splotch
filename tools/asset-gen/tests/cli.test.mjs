import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseNonNegative, parsePositiveInt, parseTemperature } from '../lib/cli.mjs';

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
});

function expectFailure(parse, raw, name, fallback, source, message) {
  expect(() => parse(raw, name, fallback, source)).toThrow('process exited');
  expect(error).toHaveBeenCalledWith(message);
  expect(exit).toHaveBeenCalledWith(1);
}

describe('parsePositiveInt', () => {
  test('returns the fallback for an omitted value and parses positive integer strings', () => {
    expect(parsePositiveInt(undefined, '--samples', 3)).toBe(3);
    expect(parsePositiveInt('1', '--samples', 3)).toBe(1);
    expect(parsePositiveInt('12', '--samples', 3)).toBe(12);
  });

  test.each(['nope', '0', '-1', '1.5'])('rejects invalid positive integers: %s', (raw) => {
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
  test('returns the fallback and accepts numeric strings at both bounds', () => {
    expect(parseTemperature(undefined, '--temperature', 0.5)).toBe(0.5);
    expect(parseTemperature(undefined, '--temperature', undefined)).toBeUndefined();
    expect(parseTemperature('0', '--temperature', 0.5)).toBe(0);
    expect(parseTemperature('1.25', '--temperature', 0.5)).toBe(1.25);
    expect(parseTemperature('2', '--temperature', 0.5)).toBe(2);
  });

  test.each(['nope', '-0.1', '2.1'])('rejects invalid temperatures: %s', (raw) => {
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
  test('returns the fallback and accepts non-negative numeric strings', () => {
    expect(parseNonNegative(undefined, '--threshold', 2)).toBe(2);
    expect(parseNonNegative('0', '--threshold', 2)).toBe(0);
    expect(parseNonNegative('1.5', '--threshold', 2)).toBe(1.5);
  });

  test.each(['nope', '-0.1'])('rejects invalid non-negative numbers: %s', (raw) => {
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

const commandCases = [
  [
    'gen-coloring-fills.mjs',
    ['--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-coloring-fills-dark.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-coloring-chalk.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'normalize-outline-strokes.mjs',
    ['nature/ant-tall', '--dry-run', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-coloring-outlines-fresh.mjs',
    ['nature/ant-tall', '--scene', 'test', '--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-style-covers.mjs',
    ['--temperature', 'invalid'],
    '--temperature must be a number between 0 and 2, got "invalid"',
  ],
  [
    'gen-coloring-fills.mjs',
    ['--samples', '1.5'],
    '--samples must be a positive integer, got "1.5"',
  ],
  [
    'gen-coloring-fills-dark.mjs',
    ['nature/ant-tall', '--dry-run', '--samples', '1.5'],
    '--samples must be a positive integer, got "1.5"',
  ],
  [
    'gen-coloring-fills-dark.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-coloring-chalk.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'normalize-outline-strokes.mjs',
    ['nature/ant-tall', '--dry-run', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-coloring-outlines-fresh.mjs',
    ['nature/ant-tall', '--scene', 'test', '--max-attempts', '1.5'],
    '--max-attempts must be a positive integer, got "1.5"',
  ],
  [
    'gen-coloring-fills-dark.mjs',
    ['nature/ant-tall', '--dry-run', '--drift-threshold', 'invalid'],
    '--drift-threshold must be a non-negative number, got "invalid"',
  ],
  [
    'gen-coloring-chalk.mjs',
    ['nature/ant-tall', '--dry-run', '--invented-max', 'invalid'],
    '--invented-max must be a non-negative number, got "invalid"',
  ],
];

test.each(commandCases)('%s uses the canonical numeric diagnostic', (script, args, expected) => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', join(import.meta.dirname, '..', 'bin', script), ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, GEMINI_API_KEY: 'test', NODE_NO_WARNINGS: '1' },
    }
  );

  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe(expected);
});
