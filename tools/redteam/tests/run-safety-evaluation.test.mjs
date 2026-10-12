import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError, sendEachCase } from '../run-safety-evaluation.mjs';

const REQUEST_SECRET = 'splotch-redteam-secret-sentinel';

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

  it("records the reason a case's fetch failed, not just that it did", async () => {
    const send = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('Headers Timeout Error') });
    });

    const [row] = await sendEachCase(CASES.slice(0, 1), send);

    expect(row.detail).toBe('fetch failed — caused by: Headers Timeout Error');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Headers Timeout Error'));
  });
});

describe('describeError', () => {
  it('names every cause of an aborting failure and masks a bearer credential', () => {
    const refused = new Error('connect ECONNREFUSED 127.0.0.1:5198');
    const upstream = new Error(`Authorization: Bearer ${REQUEST_SECRET} rejected`, {
      cause: refused,
    });

    const reason = describeError(new TypeError('fetch failed', { cause: upstream }));

    expect(reason).toBe(
      'fetch failed — caused by: Authorization: Bearer [redacted] rejected' +
        ' — caused by: connect ECONNREFUSED 127.0.0.1:5198'
    );
    expect(reason).not.toContain(REQUEST_SECRET);
  });

  it('describes a thrown non-error by its string', () => {
    expect(describeError('server exited')).toBe('server exited');
  });
});
