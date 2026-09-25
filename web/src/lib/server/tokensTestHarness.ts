import { createHmac } from 'node:crypto';
import { vi } from 'vitest';

export const USAGE_SECRET = 'token-tests-usage-secret';

export function usageGrantKey(token: string): string {
  const id = createHmac('sha256', USAGE_SECRET)
    .update('splotch-managed-usage-v1')
    .update('\0')
    .update(token)
    .digest('hex');
  return `grant-v1/${id}`;
}

// Two backing modes per test: `blobsState.stores = null` makes getStore throw
// (the in-memory fallback path, as in `vite dev`); a Map of fake stores
// emulates Netlify Blobs with real etag compare-and-set semantics so the
// concurrent-mutation retry loop can be exercised. Modules are re-imported per
// test so their module-level state starts fresh each time. The mocks below
// reach tokens.ts only because every consumer imports it dynamically after
// vi.resetModules().
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

export { envState, storeFor };

export async function freshTokens(seed = '') {
  vi.resetModules();
  devState.value = true;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = null;
  return import('./tokens');
}

export async function freshTokensOutsideDev(seed = '') {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = null;
  return import('./tokens');
}

export async function freshTokensWithBlobs(list: string[]) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = '';
  blobsState.stores = new Map();
  await storeFor('access-tokens').setJSON('list', list);
  return import('./tokens');
}

export async function seedBlobsOutsideDev(seed: string, list: string[]) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = new Map();
  const store = storeFor('access-tokens');
  await store.setJSON('list', list);
  return store;
}

export async function freshTokensWithSeedRace(seed: string, list: string[], hiddenReads: number) {
  const store = await seedBlobsOutsideDev(seed, list);
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
export async function freshTokensWithFailingBlobs(seed: string, list: string[]) {
  const store = await seedBlobsOutsideDev(seed, list);
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

export async function freshTokensWithEmptyBlobs(seed: string) {
  vi.resetModules();
  devState.value = false;
  envState.ALLOWED_TOKENS_LIST = seed;
  blobsState.stores = new Map(); // Blobs configured, key not yet written
  return import('./tokens');
}
