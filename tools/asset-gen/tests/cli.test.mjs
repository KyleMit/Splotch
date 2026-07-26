import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

function expectFailure(parse, raw, name, fallback, message) {
  expect(() => parse(raw, name, fallback)).toThrow('process exited');
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
      '--temperature (cli)',
      0.5,
      `--temperature (cli) must be a number between 0 and 2, got "${raw}"`
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
      '--threshold (page via notes.json)',
      2,
      `--threshold (page via notes.json) must be a non-negative number, got "${raw}"`
    );
  });
});
