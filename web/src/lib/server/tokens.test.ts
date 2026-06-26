import { describe, it, expect, beforeEach, vi } from 'vitest';

// These tests exercise the in-memory fallback path: when Netlify Blobs is
// unavailable (as in `vite dev`), getStore throws, the list is seeded from
// ALLOWED_TOKENS_LIST, and mutations live in a per-instance variable. We mock
// Blobs to always throw and re-import the module per test so its module-level
// fallback state starts fresh each time.
vi.mock('@netlify/blobs', () => ({
  getStore: () => {
    throw new Error('MissingBlobsEnvironment');
  },
}));

const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

async function freshTokens(seed = '') {
  vi.resetModules();
  envState.ALLOWED_TOKENS_LIST = seed;
  return import('./tokens');
}

beforeEach(() => {
  // Silence the expected "Blobs unavailable" warning from openStore.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getTokens / seeding', () => {
  it('seeds from ALLOWED_TOKENS_LIST, trimming and dropping blanks', async () => {
    const { getTokens } = await freshTokens(' a , b ,, c ');
    expect(await getTokens()).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list when nothing is seeded', async () => {
    const { getTokens } = await freshTokens('');
    expect(await getTokens()).toEqual([]);
  });
});

describe('getTokensStatus', () => {
  it('reports persistent: false on the in-memory fallback', async () => {
    const { getTokensStatus } = await freshTokens('a');
    expect(await getTokensStatus()).toEqual({ tokens: ['a'], persistent: false });
  });
});

describe('isAllowedToken', () => {
  it('accepts a seeded token and rejects unknown or non-string input', async () => {
    const { isAllowedToken } = await freshTokens('good');
    expect(await isAllowedToken('good')).toBe(true);
    expect(await isAllowedToken('bad')).toBe(false);
    expect(await isAllowedToken(undefined)).toBe(false);
    expect(await isAllowedToken(123)).toBe(false);
  });
});

describe('addToken', () => {
  it('adds a trimmed token and reflects it in the list', async () => {
    const { addToken, isAllowedToken } = await freshTokens('');
    const result = await addToken('  new-token  ');
    expect(result).toEqual({ ok: true, tokens: ['new-token'] });
    expect(await isAllowedToken('new-token')).toBe(true);
  });

  it('rejects an empty token', async () => {
    const { addToken } = await freshTokens('');
    expect(await addToken('   ')).toEqual({ ok: false, error: 'Token cannot be empty' });
  });

  it('rejects a duplicate token', async () => {
    const { addToken } = await freshTokens('existing');
    expect(await addToken('existing')).toEqual({ ok: false, error: 'Token already exists' });
  });
});

describe('removeToken', () => {
  it('removes a token and returns the remaining list', async () => {
    const { removeToken } = await freshTokens('a,b,c');
    expect(await removeToken('b')).toEqual({ ok: true, tokens: ['a', 'c'] });
  });

  it('is a no-op for an unknown token', async () => {
    const { removeToken } = await freshTokens('a,b');
    expect(await removeToken('missing')).toEqual({ ok: true, tokens: ['a', 'b'] });
  });
});
