// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Two backing modes per test: `blobsState.stores = null` makes getStore throw
// (the in-memory fallback path, as in `vite dev`); a Map of fake stores
// emulates Netlify Blobs with real etag compare-and-set semantics so the
// concurrent-mutation retry loop can be exercised. Modules are re-imported per
// test so their module-level state starts fresh each time.
const { devState, envState, blobsState, storeFor } = vi.hoisted(() => {
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
    devState: { value: true },
    envState: {} as Record<string, string | undefined>,
    blobsState,
    storeFor,
  };
});

vi.mock('@netlify/blobs', () => ({
  getStore: (name: string) => storeFor(name),
}));
vi.mock('$app/environment', () => ({
  get dev() {
    return devState.value;
  },
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

async function freshTokens(seed = '') {
  vi.resetModules();
  devState.value = true;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = null;
  return import('./tokens');
}

async function freshTokensOutsideDev(seed = '') {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = null;
  return import('./tokens');
}

async function freshTokensWithBlobs(list: string[]) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = '';
  blobsState.stores = new Map();
  await storeFor('access-tokens').setJSON('list', list);
  return import('./tokens');
}

async function freshTokensWithSeedRace(seed: string, list: string[], hiddenReads: number) {
  vi.resetModules();
  devState.value = false;
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

// Blobs is configured and holds `list`, but every read of it throws until
// `recoverBlobs()` is called — the transient-outage shape, as distinct from the
// unconfigured-Blobs shape `freshTokens` sets up.
async function freshTokensWithFailingBlobs(seed: string, list: string[]) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = new Map();
  const store = storeFor('access-tokens');
  await store.setJSON('list', list);
  const read = store.getWithMetadata.bind(store);
  store.getWithMetadata = async () => {
    throw new Error('transient blobs read failure');
  };
  return {
    tokens: await import('./tokens'),
    recoverBlobs: () => {
      store.getWithMetadata = read;
    },
  };
}

async function freshTokensWithEmptyBlobs(seed: string) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = new Map(); // Blobs configured, key not yet written
  return import('./tokens');
}

beforeEach(() => {
  // Silence the expected "Blobs unavailable" warning from openStore.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getTokensStatus / seeding', () => {
  it('seeds from ALLOWED_TOKENS_LIST, trimming and dropping blanks', async () => {
    const { getTokensStatus } = await freshTokens(' a , b ,, c ');
    expect((await getTokensStatus()).tokens).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list when nothing is seeded', async () => {
    const { getTokensStatus } = await freshTokens('');
    expect((await getTokensStatus()).tokens).toEqual([]);
  });
});

describe('getTokensStatus', () => {
  it('reports persistent: false on the in-memory fallback', async () => {
    const { getTokensStatus } = await freshTokens('a');
    expect(await getTokensStatus()).toEqual({ tokens: ['a'], persistent: false });
  });

  it('still serves env-seeded reads outside Vite dev', async () => {
    const { getTokensStatus, isAllowedToken } = await freshTokensOutsideDev('seeded');

    expect(await getTokensStatus()).toEqual({ tokens: ['seeded'], persistent: false });
    expect(await isAllowedToken('seeded')).toBe(true);
  });
});

describe('mutations when getStore fails', () => {
  it('keeps the in-memory token list writable in Vite dev', async () => {
    const { addToken, removeToken } = await freshTokens('seeded');

    expect(await addToken('local')).toEqual({ ok: true, tokens: ['seeded', 'local'] });
    expect(await removeToken('seeded')).toEqual({ ok: true, tokens: ['local'] });
  });

  it('fails closed outside Vite dev', async () => {
    const { addToken, removeToken, TOKEN_UNAVAILABLE_ERROR } =
      await freshTokensOutsideDev('seeded');
    const unavailable = {
      ok: false,
      error: TOKEN_UNAVAILABLE_ERROR,
      reason: 'unavailable',
    } as const;

    expect(await addToken('false-success')).toEqual(unavailable);
    expect(await removeToken('seeded')).toEqual(unavailable);
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

describe('first seed into empty Blobs', () => {
  it('writes the env seed on a genuine first run and reports it durable', async () => {
    const { getTokensStatus } = await freshTokensWithEmptyBlobs('seeded');
    // Empty store + key absent → the onlyIfNew write actually creates the key
    // (modified: true), so the seed is returned as blobs-backed, not memory.
    expect(await getTokensStatus()).toEqual({ tokens: ['seeded'], persistent: true });
    expect(await storeFor('access-tokens').get('list')).toEqual(['seeded']);
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

  it('confirms the current list when a transient reread failure precedes success', async () => {
    vi.resetModules();
    envState.ALLOWED_TOKENS_LIST = 'legacy';
    blobsState.stores = new Map();
    const store = storeFor('access-tokens');
    await store.setJSON('list', ['current']);
    const read = store.getWithMetadata.bind(store);
    let calls = 0;
    store.getWithMetadata = async (key: string, options?: unknown) => {
      calls++;
      if (calls === 1) return null; // initial read lags → seed branch, modified:false
      if (calls === 2) throw new Error('transient blobs read failure'); // first reread blips
      return read(key, options); // second reread sees the real list
    };
    const { isAllowedToken } = await import('./tokens');
    // A single transient blip must not collapse to unconfirmed/deny.
    expect(await isAllowedToken('current')).toBe(true);
    expect(await isAllowedToken('legacy')).toBe(false);
  });

  it('calls an all-throws confirmation an outage, not a losable race', async () => {
    vi.resetModules();
    envState.ALLOWED_TOKENS_LIST = 'legacy';
    blobsState.stores = new Map();
    const store = storeFor('access-tokens');
    await store.setJSON('list', ['current']);
    let calls = 0;
    store.getWithMetadata = async () => {
      // Each readStore consumes four calls: a lagging initial read reporting
      // the key absent (→ seed branch → modified:false), then three
      // confirmation rereads that an unreachable store never answers.
      if (calls++ % 4 === 0) return null;
      throw new Error('blobs unreachable');
    };
    const { addToken, isAllowedToken, TOKEN_UNAVAILABLE_ERROR } = await import('./tokens');
    // Nothing changed and the store never answered — the same shape as a
    // degraded read, so it must not be reported as a retryable CAS conflict.
    expect(await addToken('mine')).toEqual({
      ok: false,
      error: TOKEN_UNAVAILABLE_ERROR,
      reason: 'unavailable',
    });
    // Still fails closed: an unconfirmed winner denies every token, including
    // the env seed that lost the race.
    expect(await isAllowedToken('legacy')).toBe(false);
    expect(await isAllowedToken('current')).toBe(false);
    expect(await storeFor('access-tokens').get('list')).toEqual(['current']);
  });

  it('fails closed and rejects mutations when the winning list cannot be confirmed', async () => {
    const { isAllowedToken, addToken, TOKEN_CONFLICT_ERROR } = await freshTokensWithSeedRace(
      'legacy',
      ['current'],
      Number.POSITIVE_INFINITY
    );
    expect(await isAllowedToken('legacy')).toBe(false);
    expect(await isAllowedToken('current')).toBe(false);
    expect(await addToken('mine')).toEqual({
      ok: false,
      error: TOKEN_CONFLICT_ERROR,
      reason: 'conflict',
    });
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
    expect(await addToken('   ')).toEqual({
      ok: false,
      error: 'Token cannot be empty',
      reason: 'invalid',
    });
  });

  it('rejects a duplicate token', async () => {
    const { addToken } = await freshTokens('existing');
    expect(await addToken('existing')).toEqual({
      ok: false,
      error: 'Token already exists',
      reason: 'invalid',
    });
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
    expect(await addToken('mine')).toEqual({
      ok: false,
      error: TOKEN_CONFLICT_ERROR,
      reason: 'conflict',
    });
    expect(await removeToken('winner')).toEqual({
      ok: false,
      error: TOKEN_CONFLICT_ERROR,
      reason: 'conflict',
    });
  });
});

describe('mutations during a transient Blobs read failure', () => {
  it('refuses a revocation instead of reporting one the durable list never saw', async () => {
    const { tokens, recoverBlobs } = await freshTokensWithFailingBlobs('legacy,durable', [
      'legacy',
      'durable',
    ]);
    expect(await tokens.removeToken('durable')).toEqual({
      ok: false,
      error: tokens.TOKEN_UNAVAILABLE_ERROR,
      reason: 'unavailable',
    });
    // The in-memory stand-in must not absorb the write either: a revocation
    // that only lands there is undone the moment Blobs recovers.
    expect((await tokens.getTokensStatus()).tokens).toEqual(['legacy', 'durable']);
    recoverBlobs();
    expect(await tokens.isAllowedToken('durable')).toBe(true);
    expect(await storeFor('access-tokens').get('list')).toEqual(['legacy', 'durable']);
  });

  it('refuses an add rather than banking it in memory', async () => {
    const { tokens, recoverBlobs } = await freshTokensWithFailingBlobs('legacy', ['legacy']);
    expect(await tokens.addToken('mine')).toEqual({
      ok: false,
      error: tokens.TOKEN_UNAVAILABLE_ERROR,
      reason: 'unavailable',
    });
    expect((await tokens.getTokensStatus()).tokens).toEqual(['legacy']);
    recoverBlobs();
    expect(await tokens.isAllowedToken('mine')).toBe(false);
  });

  it('still serves reads from the in-memory stand-in', async () => {
    const { tokens } = await freshTokensWithFailingBlobs('legacy', ['legacy', 'durable']);
    expect(await tokens.getTokensStatus()).toEqual({ tokens: ['legacy'], persistent: false });
    expect(await tokens.isAllowedToken('legacy')).toBe(true);
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
    const { removeToken, getTokensStatus } = await freshTokensWithBlobs(['a', 'revoked']);
    const usage = storeFor('ai-usage');
    await usage.setJSON('revoked', { count: 3 });
    usage.delete = async () => {
      throw new Error('blobs outage');
    };
    expect(await removeToken('revoked')).toEqual({ ok: true, tokens: ['a'] });
    expect((await getTokensStatus()).tokens).toEqual(['a']);
  });

  it('does not touch usage for a no-op remove', async () => {
    const { removeToken } = await freshTokensWithBlobs(['a']);
    const usage = storeFor('ai-usage');
    await usage.setJSON('missing', { count: 2 });
    expect(await removeToken('missing')).toEqual({ ok: true, tokens: ['a'] });
    expect(usage.blobs.has('missing')).toBe(true);
  });
});
