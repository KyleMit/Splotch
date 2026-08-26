import { describe, expect, it } from 'vitest';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import { pollFor } from '../split-capture/lib/poll.mjs';

describe('rethrowIfBroken', () => {
  it('rethrows a ReferenceError — broken code must escape a swallow', () => {
    expect(() => rethrowIfBroken(new ReferenceError('x is not defined'))).toThrow(ReferenceError);
  });

  // The PR 1376 review's repro: a null property dereference in a predicate is
  // programmer error wearing TypeError, and must escape like ReferenceError.
  it('rethrows a programmer TypeError', () => {
    let dereference;
    try {
      dereference = null.missing;
    } catch (error) {
      expect(() => rethrowIfBroken(error)).toThrow(TypeError);
    }
    expect(dereference).toBeUndefined();
  });

  // The network failures the fetch stack spells as TypeError are the not-ready
  // states a retry loop exists to ride out — recognized by their fixed
  // messages, not by classifying the whole type.
  it('keeps operational failures swallowed', () => {
    expect(() => rethrowIfBroken(new TypeError('fetch failed'))).not.toThrow();
    expect(() => rethrowIfBroken(new TypeError('Failed to fetch'))).not.toThrow();
    expect(() => rethrowIfBroken(new TypeError('Load failed'))).not.toThrow();
    expect(() => rethrowIfBroken(new Error('ECONNREFUSED'))).not.toThrow();
    expect(() => rethrowIfBroken(new SyntaxError('Unexpected token'))).not.toThrow();
  });
});

describe('pollFor', () => {
  it('retries operational failures until the value arrives', async () => {
    let calls = 0;
    const value = await pollFor(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('not ready');
        return 'ready';
      },
      5_000,
      { intervalMs: 1 }
    );
    expect(value).toBe('ready');
    expect(calls).toBe(3);
  });

  // The issue-1296 incident shape: a missing import retried until the deadline
  // and reported the same timeout a genuinely absent device produces. Broken
  // code now escapes on the first attempt instead of burning the budget.
  it('escapes immediately on a ReferenceError instead of timing out', async () => {
    let calls = 0;
    await expect(
      pollFor(
        async () => {
          calls += 1;
          throw new ReferenceError('classifyAppiumLog is not defined');
        },
        5_000,
        { intervalMs: 1 }
      )
    ).rejects.toThrow(ReferenceError);
    expect(calls).toBe(1);
  });
});
