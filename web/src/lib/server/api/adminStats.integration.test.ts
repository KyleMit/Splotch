// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every Netlify Blobs store as one in-memory map per store name, so the real usage and grant
// readers run against fixture records.
const { envState, stores, getStoreMock, getTokensStatus } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  stores: new Map<string, Map<string, { data: unknown; etag: string }>>(),
  getStoreMock: vi.fn(),
  getTokensStatus: vi.fn<typeof import('$lib/server/tokens').getTokensStatus>(),
}));

vi.mock('$lib/server/privateEnv', () => ({ env: envState }));
vi.mock('$lib/server/runtimeMode', () => ({ dev: false }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$lib/server/tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/tokens')>()),
  getTokensStatus,
}));

import { sessionToken } from '$lib/server/admin';
import {
  completeFreeGeneration,
  failFreeGeneration,
  reserveFreeGeneration,
} from '$lib/server/freeGenerationGrants';
import { USAGE_STORE_NAME } from '$lib/server/usageRecordStorage';
import { managedUsageKey } from '$lib/server/usageTelemetry';
import { GET } from './adminStats';

const SECRET = 'the-raw-secret';
const USAGE_SECRET = 'the-usage-secret';
const INSTALLATION = 'c'.repeat(64);
const USAGE = {
  count: 3,
  firstUsed: '2026-10-01T09:00:00.000Z',
  lastUsed: '2026-10-02T09:00:00.000Z',
  deleteAfter: '2999-10-31T09:00:00.000Z',
  lastStyle: 'Crayon',
  lastOutcome: 'succeeded',
};

function fakeStore(entries: Map<string, { data: unknown; etag: string }>) {
  let version = 0;
  return {
    get: vi.fn(async (key: string) => structuredClone(entries.get(key)?.data ?? null)),
    getWithMetadata: vi.fn(async (key: string) => {
      const entry = entries.get(key);
      return entry ? { data: structuredClone(entry.data), etag: entry.etag, metadata: {} } : null;
    }),
    setJSON: vi.fn(
      async (
        key: string,
        data: unknown,
        condition: { onlyIfNew?: boolean; onlyIfMatch?: string } = {}
      ) => {
        const existing = entries.get(key);
        if (condition.onlyIfNew && existing) return { modified: false };
        if (condition.onlyIfMatch && existing?.etag !== condition.onlyIfMatch)
          return { modified: false };
        const etag = `v${++version}`;
        entries.set(key, { data: structuredClone(data), etag });
        return { modified: true, etag };
      }
    ),
    delete: vi.fn(async (key: string) => void entries.delete(key)),
    list: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { blobs: [...entries].map(([key, { etag }]) => ({ key, etag })) };
      },
    })),
  };
}

function storeNamed(name: string) {
  const entries = stores.get(name) ?? new Map();
  stores.set(name, entries);
  return entries;
}

function statsRequest(authorization?: string) {
  const request = new Request('https://splotch.art/api/admin/stats', {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
  return GET({ request, url: new URL(request.url) } as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
  envState.USAGE_GRANT_ID_SECRET = USAGE_SECRET;
  stores.clear();
  getStoreMock
    .mockReset()
    .mockImplementation(({ name }: { name: string }) => fakeStore(storeNamed(name)));
  getTokensStatus.mockReset().mockResolvedValue({ tokens: ['used', 'unused'], persistent: true });
});

async function seedUsedCode() {
  const key = managedUsageKey('used', USAGE_SECRET);
  if (!key) throw new Error('Expected a usage key');
  storeNamed(USAGE_STORE_NAME).set(key, { data: USAGE, etag: 'v0' });
}

async function seedGrant() {
  const succeeded = await reserveFreeGeneration(INSTALLATION);
  const refused = await reserveFreeGeneration(INSTALLATION);
  if (!succeeded.reserved || !refused.reserved) throw new Error('Expected two reservations');
  await completeFreeGeneration(INSTALLATION, succeeded.reservationId);
  await failFreeGeneration(INSTALLATION, 'safety', refused.reservationId);
}

describe('GET /api/admin/stats', () => {
  it.for([
    { name: 'no Authorization header', authorization: undefined },
    { name: 'a bearer that is not the session', authorization: 'Bearer deadbeef' },
    { name: 'the raw admin secret', authorization: `Bearer ${SECRET}` },
  ])('refuses $name with the uniform 401 and reads no store', async ({ authorization }) => {
    await seedUsedCode();
    getStoreMock.mockClear();

    const response = await statsRequest(authorization);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
    expect(getStoreMock).not.toHaveBeenCalled();
    expect(getTokensStatus).not.toHaveBeenCalled();
  });

  it("returns each listed code's tally and the grant figures from the stores", async () => {
    await seedUsedCode();
    await seedGrant();

    const response = await statsRequest(`Bearer ${sessionToken()}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      usageAvailable: true,
      codes: [
        { token: 'used', usage: USAGE },
        { token: 'unused', usage: null },
      ],
      freeGrantStats: {
        persistent: true,
        dailyProviderStarts: 0,
        sampledGrantCount: 1,
        sampledSuccessful: 1,
        sampledAttempts: 2,
        sampledFailures: 1,
        sampledActiveGrants: 1,
        sampledExhaustedGrants: 0,
        sampledActiveReservations: 0,
        recent: [
          {
            installation: INSTALLATION.slice(0, 8),
            successful: 1,
            attempts: 2,
            failures: 1,
            lastFailureKind: 'safety',
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain(INSTALLATION);
  });

  // A tally store nobody can read and a code nobody has used both leave `usage` null; only the
  // flag tells the console which one it is looking at.
  it('flags the tallies unavailable when the usage secret is unset', async () => {
    await seedUsedCode();
    delete envState.USAGE_GRANT_ID_SECRET;

    const body = await (await statsRequest(`Bearer ${sessionToken()}`)).json();

    expect(body).toMatchObject({
      usageAvailable: false,
      codes: [
        { token: 'used', usage: null },
        { token: 'unused', usage: null },
      ],
    });
  });

  it('keeps the tallies when the grant store cannot be listed', async () => {
    await seedUsedCode();
    getStoreMock.mockImplementation(({ name }: { name: string }) => {
      const store = fakeStore(storeNamed(name));
      if (name !== USAGE_STORE_NAME)
        store.list.mockImplementation(() => {
          throw new Error('Blobs list failed');
        });
      return store;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await statsRequest(`Bearer ${sessionToken()}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      usageAvailable: true,
      codes: [
        { token: 'used', usage: { count: 3 } },
        { token: 'unused', usage: null },
      ],
      freeGrantStats: null,
    });
  });

  it('reads a code named like an Object.prototype member as never used', async () => {
    getTokensStatus.mockResolvedValue({ tokens: ['constructor'], persistent: true });

    const body = await (await statsRequest(`Bearer ${sessionToken()}`)).json();

    expect(body.codes).toEqual([{ token: 'constructor', usage: null }]);
  });
});
