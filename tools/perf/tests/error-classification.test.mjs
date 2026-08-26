import { describe, expect, it } from 'vitest';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import { pollFor } from '../split-capture/lib/poll.mjs';

describe('rethrowIfBroken', () => {
  it('rethrows a ReferenceError — broken code must escape a swallow', () => {
    expect(() => rethrowIfBroken(new ReferenceError('x is not defined'))).toThrow(ReferenceError);
  });

  // undici reports network failure as TypeError('fetch failed'), and a missing
  // property on a partially-loaded response is a TypeError too — both are the
  // not-ready states a retry loop exists to ride out.
  it('keeps operational failures swallowed', () => {
    expect(() => rethrowIfBroken(new TypeError('fetch failed'))).not.toThrow();
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
