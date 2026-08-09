// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StoredEntry {
  data: unknown;
  etag: string;
}

const { entries, getStoreMock } = vi.hoisted(() => ({
  entries: new Map<string, StoredEntry>(),
  getStoreMock: vi.fn(),
}));

vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$app/environment', () => ({ dev: false }));

import {
  ADMIN_GRANT_SAMPLE_LIMIT,
  completeFreeGeneration,
  failFreeGeneration,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  getDailyFreeGenerationStatus,
  getFreeGenerationGrantAdminStats,
  getFreeGenerationGrantStatus,
  reserveDailyFreeGeneration,
  reserveFreeGeneration,
} from './freeGenerationGrants';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeStore() {
  let version = 0;
  return {
    get: vi.fn(async (key: string) => clone(entries.get(key)?.data ?? null)),
    getWithMetadata: vi.fn(async (key: string) => {
      const entry = entries.get(key);
      return entry ? { data: clone(entry.data), etag: entry.etag, metadata: {} } : null;
    }),
    setJSON: vi.fn(
      async (
        key: string,
        data: unknown,
        condition: { onlyIfNew?: boolean; onlyIfMatch?: string }
      ) => {
        const existing = entries.get(key);
        if (condition.onlyIfNew && existing) return { modified: false };
        if (condition.onlyIfMatch && existing?.etag !== condition.onlyIfMatch) {
          return { modified: false };
        }
        const etag = `v${++version}`;
        entries.set(key, { data: clone(data), etag });
        return { modified: true, etag };
      }
    ),
    list: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { blobs: [...entries.keys()].map((key) => ({ key, etag: entries.get(key)!.etag })) };
      },
    })),
  };
}

const installation = (digit: string) => digit.repeat(64);

beforeEach(() => {
  entries.clear();
  getStoreMock.mockReset().mockReturnValue(makeStore());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('free generation grants', () => {
  it('atomically reserves at most ten concurrent generations', async () => {
    const id = installation('a');
    const reservations = await Promise.all(
      Array.from({ length: 11 }, () => reserveFreeGeneration(id))
    );

    const accepted = reservations.filter((result) => result.reserved);
    expect(accepted).toHaveLength(10);
    expect(reservations.filter((result) => !result.reserved)).toHaveLength(1);

    await Promise.all(
      accepted.map((result) =>
        result.reserved ? completeFreeGeneration(id, result.reservationId) : undefined
      )
    );
    await expect(getFreeGenerationGrantStatus(id)).resolves.toEqual({ remaining: 0 });
  });

  it('releases a failed reservation without consuming the allowance', async () => {
    const id = installation('b');
    const reservation = await reserveFreeGeneration(id);
    if (!reservation.reserved) throw new Error('Expected a reservation');

    await failFreeGeneration(id, 'safety', reservation.reservationId);

    await expect(getFreeGenerationGrantStatus(id)).resolves.toEqual({ remaining: 10 });
    const stats = await getFreeGenerationGrantAdminStats();
    expect(stats).toMatchObject({
      sampledSuccessful: 0,
      sampledAttempts: 1,
      sampledFailures: 1,
    });
    expect(stats.recent[0]).toMatchObject({ installation: 'bbbbbbbb', lastFailureKind: 'safety' });
  });

  it('decrements only when a reserved generation is completed', async () => {
    const id = installation('c');
    const reservation = await reserveFreeGeneration(id);
    if (!reservation.reserved) throw new Error('Expected a reservation');

    await expect(getFreeGenerationGrantStatus(id)).resolves.toEqual({ remaining: 9 });
    await completeFreeGeneration(id, reservation.reservationId);
    await expect(getFreeGenerationGrantStatus(id)).resolves.toEqual({ remaining: 9 });
  });

  it('atomically refuses provider starts after the durable daily ceiling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
    entries.set('daily-provider-starts/2026-08-09', {
      data: {
        version: 1,
        date: '2026-08-09',
        starts: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - 1,
      },
      etag: 'daily-v1',
    });

    await expect(reserveDailyFreeGeneration()).resolves.toEqual({ reserved: true, remaining: 0 });
    await expect(reserveDailyFreeGeneration()).resolves.toEqual({ reserved: false, remaining: 0 });
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({
      available: false,
      starts: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
    });
  });

  it('fails closed outside development when durable accounting is unavailable', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('Missing Blobs environment');
    });

    await expect(reserveDailyFreeGeneration()).rejects.toThrow('Missing Blobs environment');
  });

  it('keeps read-only admin monitoring available with a labelled memory fallback', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('Missing Blobs environment');
    });

    await expect(getFreeGenerationGrantAdminStats()).resolves.toMatchObject({
      persistent: false,
      dailyProviderStarts: 0,
      sampledGrantCount: 0,
    });
  });

  it('bounds admin enumeration and labels the grant metrics as a partial sample', async () => {
    for (let index = 0; index <= ADMIN_GRANT_SAMPLE_LIMIT; index++) {
      entries.set(index.toString(16).padStart(64, '0'), {
        data: null,
        etag: `grant-${index}`,
      });
    }

    const stats = await getFreeGenerationGrantAdminStats();

    expect(stats).toMatchObject({
      sampledGrantCount: ADMIN_GRANT_SAMPLE_LIMIT,
      grantSampleLimit: ADMIN_GRANT_SAMPLE_LIMIT,
      grantSamplePartial: true,
    });
    const store = getStoreMock.mock.results[0]?.value;
    expect(store.get).toHaveBeenCalledTimes(ADMIN_GRANT_SAMPLE_LIMIT + 1);
  });
});
