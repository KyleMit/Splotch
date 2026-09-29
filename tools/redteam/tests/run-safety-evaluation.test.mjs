import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEachCase } from '../run-safety-evaluation.mjs';

const CASES = [
  { id: 'safe-a', expectation: 'allow-safe' },
  { id: 'safe-b', expectation: 'allow-safe' },
  { id: 'block-a', expectation: 'block' },
];

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendEachCase', () => {
  it('records a throwing case as an error row and still sends every later case', async () => {
    const send = vi.fn(async (c) => {
      if (c.id === 'safe-b') throw new Error('fixture would not flatten');
      return {
        ...c,
        outcome: c.expectation === 'block' ? 'blocked' : 'image',
        status: 0,
        detail: '',
      };
    });

    const results = await sendEachCase(CASES, send);

    expect(send).toHaveBeenCalledTimes(CASES.length);
    expect(results.map((r) => [r.id, r.outcome])).toEqual([
      ['safe-a', 'image'],
      ['safe-b', 'error'],
      ['block-a', 'blocked'],
    ]);
    expect(results[1].detail).toContain('fixture would not flatten');
  });
});
