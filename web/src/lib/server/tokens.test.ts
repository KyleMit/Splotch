import { describe, it, expect, beforeEach, vi } from 'vitest';

// Two backing modes per test: `blobsState.stores = null` makes getStore throw
// (the in-memory fallback path, as in `vite dev`); a Map of fake stores
// emulates Netlify Blobs with real etag compare-and-set semantics so the
// concurrent-mutation retry loop can be exercised. Modules are re-imported per
// test so their module-level state starts fresh each time.
const { envState, blobsState, storeFor } = vi.hoisted(() => {
  function fakeBlobStore() {
    const blobs = new Map<string, { json: string; etag: string }>();
    let etagCounter = 0;
    return {
      blobs,
      async get(key: string, _opts?: unknown) {
        const entry = blobs.get(key);
        return entry ? JSON.parse(entry.json) : null;
      },
      async getWithMetadata(key: string, _opts?: unknown) {
        const entry = blobs.get(key);
        return entry ? { data: JSON.parse(entry.json), etag: entry.etag, metadata: {} } : null;
      },
      async setJSON(
        key: string,
        data: unknown,
        condition?: { onlyIfNew?: boolean; onlyIfMatch?: string }
      ) {
        const entry = blobs.get(key);
        if (condition?.onlyIfNew && entry) return { modified: false };
        if (condition?.onlyIfMatch !== undefined && entry?.etag !== condition.onlyIfMatch) {
          return { modified: false };
        }
        const etag = `etag-${++etagCounter}`;
        blobs.set(key, { json: JSON.stringify(data), etag });
        return { modified: true, etag };
      },
      async delete(key: string) {
        blobs.delete(key);
      },
    };
  }
  const blobsState = {
    stores: null as Map<string, ReturnType<typeof fakeBlobStore>> | null,
  };
  function storeFor(name: string) {
    if (!blobsState.stores) throw new Error('MissingBlobsEnvironment');
    let store = blobsState.stores.get(name);
    if (!store) {
      store = fakeBlobStore();
      blobsState.stores.set(name, store);
    }
    return store;
  }
  return {
    envState: {} as Record<string, string | undefined>,
    blobsState,
    storeFor,
  };
});

vi.mock('@netlify/blobs', () => ({
  getStore: (name: string) => storeFor(name),
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

async function freshTokens(seed = '') {
  vi.resetModules();
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = null;
  return import('./tokens');
}

async function freshTokensWithBlobs(list: string[]) {
  vi.resetModules();
  envState.ALLOWED_TOKENS_LIST = '';
  blobsState.stores = new Map();
  await storeFor('access-tokens').setJSON('list', list);
  return import('./tokens');
}

async function freshTokensWithSeedRace(seed: string, list: string[], hiddenReads: number) {
  vi.resetModules();
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = new Map();
  const store = storeFor('access-tokens');
  await store.setJSON('list', list);
  const read = store.getWithMetadata.bind(store);
  let reads = 0;
  store.getWithMetadata = async (key: string, options?: unknown) => {
    if (reads++ < hiddenReads) return null;
    return read(key, options);
  };
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

describe('stale-empty seed races', () => {
  it('authorizes only the persisted list after a lost seed race', async () => {
    const { isAllowedToken } = await freshTokensWithSeedRace('legacy', ['current'], 1);
    expect(await isAllowedToken('legacy')).toBe(false);
    expect(await isAllowedToken('current')).toBe(true);
  });

  it('bases mutations on the persisted list after a lost seed race', async () => {
    const { addToken } = await freshTokensWithSeedRace('legacy', ['current'], 1);
    expect(await addToken('mine')).toEqual({ ok: true, tokens: ['current', 'mine'] });
    expect(await storeFor('access-tokens').get('list')).toEqual(['current', 'mine']);
  });

  it('fails closed and rejects mutations when the winning list cannot be confirmed', async () => {
    const { isAllowedToken, addToken, TOKEN_CONFLICT_ERROR } = await freshTokensWithSeedRace(
      'legacy',
      ['current'],
      Number.POSITIVE_INFINITY
    );
    expect(await isAllowedToken('legacy')).toBe(false);
    expect(await isAllowedToken('current')).toBe(false);
    expect(await addToken('mine')).toEqual({ ok: false, error: TOKEN_CONFLICT_ERROR });
    expect(await storeFor('access-tokens').get('list')).toEqual(['current']);
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

describe('concurrent mutations against Blobs', () => {
  function raceOnce(competingList: string[]) {
    const store = storeFor('access-tokens');
    const read = store.getWithMetadata.bind(store);
    let raced = false;
    store.getWithMetadata = async (key: string) => {
      const result = await read(key);
      if (!raced) {
        raced = true;
        await store.setJSON('list', competingList);
      }
      return result;
    };
  }

  function raceAlways() {
    const store = storeFor('access-tokens');
    const read = store.getWithMetadata.bind(store);
    store.getWithMetadata = async (key: string) => {
      const result = await read(key);
      await store.setJSON('list', ['winner']);
      return result;
    };
  }

  it('persists an add through Blobs and reports persistent: true', async () => {
    const { addToken, getTokensStatus } = await freshTokensWithBlobs(['a']);
    expect(await addToken('b')).toEqual({ ok: true, tokens: ['a', 'b'] });
    expect(await getTokensStatus()).toEqual({ tokens: ['a', 'b'], persistent: true });
  });

  it('retries an add against the winning list when a concurrent write lands mid-mutation', async () => {
    const { addToken } = await freshTokensWithBlobs(['a']);
    raceOnce(['a', 'other-admin']);
    expect(await addToken('mine')).toEqual({ ok: true, tokens: ['a', 'other-admin', 'mine'] });
  });

  it('retries a remove without resurrecting the concurrent add it raced with', async () => {
    const { removeToken } = await freshTokensWithBlobs(['a', 'b']);
    raceOnce(['a', 'b', 'other-admin']);
    expect(await removeToken('b')).toEqual({ ok: true, tokens: ['a', 'other-admin'] });
  });

  it('surfaces an error instead of clobbering once retries exhaust', async () => {
    const { addToken, removeToken, TOKEN_CONFLICT_ERROR } = await freshTokensWithBlobs(['a']);
    raceAlways();
    expect(await addToken('mine')).toEqual({ ok: false, error: TOKEN_CONFLICT_ERROR });
    expect(await removeToken('winner')).toEqual({ ok: false, error: TOKEN_CONFLICT_ERROR });
  });
});

describe('usage cleanup on remove', () => {
  it('deletes the revoked token’s usage blob', async () => {
    const { removeToken } = await freshTokensWithBlobs(['a', 'revoked']);
    const usage = storeFor('ai-usage');
    await usage.setJSON('revoked', { count: 3 });
    await usage.setJSON('a', { count: 1 });
    expect(await removeToken('revoked')).toEqual({ ok: true, tokens: ['a'] });
    expect(usage.blobs.has('revoked')).toBe(false);
    expect(usage.blobs.has('a')).toBe(true);
  });

  it('still removes the token when usage cleanup fails', async () => {
    const { removeToken, getTokens } = await freshTokensWithBlobs(['a', 'revoked']);
    const usage = storeFor('ai-usage');
    await usage.setJSON('revoked', { count: 3 });
    usage.delete = async () => {
      throw new Error('blobs outage');
    };
    expect(await removeToken('revoked')).toEqual({ ok: true, tokens: ['a'] });
    expect(await getTokens()).toEqual(['a']);
  });

  it('does not touch usage for a no-op remove', async () => {
    const { removeToken } = await freshTokensWithBlobs(['a']);
    const usage = storeFor('ai-usage');
    await usage.setJSON('missing', { count: 2 });
    expect(await removeToken('missing')).toEqual({ ok: true, tokens: ['a'] });
    expect(usage.blobs.has('missing')).toBe(true);
  });
});
