// @vitest-environment node
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { envState, getStoreMock } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  getStoreMock: vi.fn(),
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));

import { deleteUsage, getUsage, recordByokUsage, recordTokenUsage, type TokenUsage } from './usage';
import { purgeExpiredUsageRecords } from './usageRecordStorage';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const SECRET = 'unit-test-usage-secret';
const TOKEN = 'super-secret-access-code';

function grantKey(token = TOKEN, secret = SECRET): string {
  const id = createHmac('sha256', secret)
    .update('splotch-managed-usage-v1')
    .update('\0')
    .update(token)
    .digest('hex');
  return `grant-v1/${id}`;
}

const usageOf = (count: number, overrides: Partial<TokenUsage> = {}): TokenUsage => ({
  count,
  firstUsed: '2026-08-01T00:00:00.000Z',
  lastUsed: '2026-08-10T00:00:00.000Z',
  deleteAfter: '2026-08-31T00:00:00.000Z',
  lastStyle: 'Crayon',
  lastOutcome: 'succeeded',
  ...overrides,
});

function makeStore() {
  return {
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    setJSON: vi.fn().mockResolvedValue({ modified: true, etag: 'new' }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  envState.USAGE_GRANT_ID_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usage logs', () => {
  it('logs only credential, style, outcome, and time for BYOK', () => {
    recordByokUsage('Crayon', 'refused');

    expect(console.log).toHaveBeenCalledWith(
      '[ai-usage] credential=byok style=Crayon outcome=refused at=2026-08-19T12:00:00.000Z'
    );
    expect(getStoreMock).not.toHaveBeenCalled();
  });

  it('does not disclose the raw code or prompt text in managed logs or blob operations', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue(null);
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: 'Felt', outcome: 'succeeded' });

    const serializedLogs = JSON.stringify([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ]);
    expect(serializedLogs).not.toContain(TOKEN);
    expect(serializedLogs).not.toContain('prompt');
    expect(console.log).toHaveBeenCalledWith(
      '[ai-usage] credential=managed style=Felt outcome=succeeded at=2026-08-19T12:00:00.000Z'
    );
    expect(store.getWithMetadata).toHaveBeenCalledWith(grantKey(), { type: 'json' });
    expect(store.setJSON.mock.calls.flat()).not.toContain(TOKEN);
  });
});

describe('recordTokenUsage', () => {
  it('creates a minimized tally with a fixed 30-day deletion boundary', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue(null);
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: 'Crayon', outcome: 'accepted' });

    expect(store.setJSON).toHaveBeenCalledWith(
      grantKey(),
      {
        count: 1,
        firstUsed: '2026-08-19T12:00:00.000Z',
        lastUsed: '2026-08-19T12:00:00.000Z',
        deleteAfter: '2026-09-18T12:00:00.000Z',
        lastStyle: 'Crayon',
        lastOutcome: 'accepted',
      },
      { onlyIfNew: true }
    );
    expect(JSON.stringify(store.setJSON.mock.calls)).not.toContain('lastPrompt');
  });

  it('increments within the same fixed window without extending its expiry', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({ data: usageOf(4), etag: 'v4', metadata: {} });
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: null, outcome: 'failed' });

    expect(store.setJSON).toHaveBeenCalledWith(
      grantKey(),
      {
        count: 5,
        firstUsed: '2026-08-01T00:00:00.000Z',
        lastUsed: '2026-08-19T12:00:00.000Z',
        deleteAfter: '2026-08-31T00:00:00.000Z',
        lastStyle: null,
        lastOutcome: 'failed',
      },
      { onlyIfMatch: 'v4' }
    );
  });

  it('starts a fresh tally at the exact expiration boundary', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({
      data: usageOf(9, { deleteAfter: NOW.toISOString() }),
      etag: 'expired',
      metadata: {},
    });
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: 'Paper', outcome: 'succeeded' });

    expect(store.setJSON.mock.calls[0][1]).toEqual({
      count: 1,
      firstUsed: NOW.toISOString(),
      lastUsed: NOW.toISOString(),
      deleteAfter: '2026-09-18T12:00:00.000Z',
      lastStyle: 'Paper',
      lastOutcome: 'succeeded',
    });
    expect(store.setJSON.mock.calls[0][2]).toEqual({ onlyIfMatch: 'expired' });
  });

  it('restarts malformed records instead of preserving legacy fields', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({
      data: { count: 3, lastPrompt: 'legacy prompt' },
      etag: 'legacy',
      metadata: {},
    });
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: null, outcome: 'refused' });

    expect(store.setJSON.mock.calls[0][1]).toMatchObject({
      count: 1,
      firstUsed: NOW.toISOString(),
      lastStyle: null,
      lastOutcome: 'refused',
    });
    expect(JSON.stringify(store.setJSON.mock.calls[0][1])).not.toContain('prompt');
  });

  it('retries a conflicting write against the freshly read value', async () => {
    const store = makeStore();
    store.getWithMetadata
      .mockResolvedValueOnce({ data: usageOf(4), etag: 'v4', metadata: {} })
      .mockResolvedValueOnce({ data: usageOf(5), etag: 'v5', metadata: {} });
    store.setJSON
      .mockResolvedValueOnce({ modified: false })
      .mockResolvedValueOnce({ modified: true, etag: 'v6' });
    getStoreMock.mockReturnValue(store);

    const recording = recordTokenUsage(TOKEN, { style: null, outcome: 'failed' });
    await vi.runAllTimersAsync();
    await recording;

    expect(store.setJSON).toHaveBeenCalledTimes(2);
    expect(store.setJSON.mock.calls[1][1].count).toBe(6);
    expect(store.setJSON.mock.calls[1][2]).toEqual({ onlyIfMatch: 'v5' });
  });

  it('concedes after repeated conflicts without throwing', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({ data: usageOf(4), etag: 'v4', metadata: {} });
    store.setJSON.mockResolvedValue({ modified: false });
    getStoreMock.mockReturnValue(store);

    const recording = recordTokenUsage(TOKEN, { style: null, outcome: 'failed' });
    await vi.runAllTimersAsync();

    await expect(recording).resolves.toBeUndefined();
    expect(store.setJSON).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('conceded'));
  });

  it('does not persist under any key when the HMAC secret is unset', async () => {
    delete envState.USAGE_GRANT_ID_SECRET;
    const store = makeStore();
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage(TOKEN, { style: null, outcome: 'failed' });

    expect(getStoreMock).not.toHaveBeenCalled();
    expect(store.setJSON).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });

  it('never throws when Blobs is unavailable', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('MissingBlobsEnvironment');
    });

    await expect(
      recordTokenUsage(TOKEN, { style: null, outcome: 'failed' })
    ).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('getUsage', () => {
  it('maps raw admin codes to records read only through derived grant keys', async () => {
    const store = makeStore();
    store.get.mockImplementation(async (key: string) => (key === grantKey() ? usageOf(2) : null));
    getStoreMock.mockReturnValue(store);

    expect(await getUsage([TOKEN, 'unused'])).toEqual({ [TOKEN]: usageOf(2) });
    expect(store.get.mock.calls.flat()).not.toContain(TOKEN);
  });

  it('deletes and omits a record at the exact expiration boundary', async () => {
    const store = makeStore();
    store.get.mockResolvedValue(usageOf(2, { deleteAfter: NOW.toISOString() }));
    getStoreMock.mockReturnValue(store);

    expect(await getUsage([TOKEN])).toEqual({});
    expect(store.delete).toHaveBeenCalledWith(grantKey());
  });

  it('does not probe the legacy raw-code key', async () => {
    const store = makeStore();
    store.get.mockResolvedValue(null);
    getStoreMock.mockReturnValue(store);

    await getUsage([TOKEN]);

    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.get).toHaveBeenCalledWith(grantKey(), { type: 'json' });
  });

  it('returns an empty map when the HMAC secret or Blobs is unavailable', async () => {
    delete envState.USAGE_GRANT_ID_SECRET;
    expect(await getUsage([TOKEN])).toEqual({});
    expect(getStoreMock).not.toHaveBeenCalled();

    envState.USAGE_GRANT_ID_SECRET = SECRET;
    getStoreMock.mockImplementation(() => {
      throw new Error('MissingBlobsEnvironment');
    });
    expect(await getUsage([TOKEN])).toEqual({});
  });
});

describe('deleteUsage', () => {
  it('deletes only the HMAC-derived key when a code is revoked', async () => {
    const store = makeStore();
    getStoreMock.mockReturnValue(store);

    await deleteUsage(TOKEN);

    expect(store.delete).toHaveBeenCalledWith(grantKey());
    expect(store.delete).not.toHaveBeenCalledWith(TOKEN);
  });

  it('does not attempt a raw-key deletion when the secret is unset', async () => {
    delete envState.USAGE_GRANT_ID_SECRET;

    await deleteUsage(TOKEN);

    expect(getStoreMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('could not delete'));
  });
});

describe('purgeExpiredUsageRecords', () => {
  it('deletes exact-boundary, malformed, and legacy raw-keyed records across pages', async () => {
    const store = makeStore();
    const expiredKey = grantKey('expired');
    const retainedKey = grantKey('retained');
    const malformedKey = grantKey('malformed');
    store.list.mockReturnValue(
      (async function* () {
        yield { blobs: [{ key: expiredKey }, { key: retainedKey }] };
        yield { blobs: [{ key: malformedKey }, { key: TOKEN }] };
      })()
    );
    store.get.mockImplementation(async (key: string) => {
      if (key === expiredKey) return JSON.stringify(usageOf(1, { deleteAfter: NOW.toISOString() }));
      if (key === retainedKey) {
        return JSON.stringify(
          usageOf(1, { deleteAfter: new Date(NOW.getTime() + 1).toISOString() })
        );
      }
      return '{not-json';
    });
    getStoreMock.mockReturnValue(store);

    await expect(purgeExpiredUsageRecords()).resolves.toEqual({
      deletedRecords: 3,
      retainedRecords: 1,
    });
    expect(store.delete.mock.calls.map(([key]) => key)).toEqual([expiredKey, malformedKey, TOKEN]);
    expect(store.get).not.toHaveBeenCalledWith(TOKEN, expect.anything());
  });
});
