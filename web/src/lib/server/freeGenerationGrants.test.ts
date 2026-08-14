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

import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
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

  it('reads strongly so a write is visible to the request that made it', async () => {
    await reserveFreeGeneration(installation('d'));

    expect(getStoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ consistency: 'strong' as const })
    );
  });

  it('refuses a completion whose lapsed slot another request already spent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
    const id = installation('e');
    for (let spent = 1; spent < FREE_GENERATION_LIMIT; spent++) {
      const used = await reserveFreeGeneration(id);
      if (!used.reserved) throw new Error('Expected a reservation');
      await completeFreeGeneration(id, used.reservationId);
    }
    const lapsing = await reserveFreeGeneration(id);
    if (!lapsing.reserved) throw new Error('Expected a reservation');
    await expect(getFreeGenerationGrantStatus(id)).resolves.toEqual({ remaining: 0 });

    // The lease expires, so the last slot is reclaimed and re-reserved by a
    // later request that completes it — leaving the first completion with an id
    // whose slot is gone. The jump has to clear the whole lease, which is sized
    // to outlive a background job rather than a single request (ADR-0115); five
    // minutes used to be enough and no longer is.
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z').getTime() + GENERATION_JOB_TTL_MS + 60_000);
    const reusing = await reserveFreeGeneration(id);
    if (!reusing.reserved) throw new Error('Expected the lapsed slot to be reusable');
    await expect(completeFreeGeneration(id, reusing.reservationId)).resolves.toEqual({
      remaining: 0,
    });

    await expect(completeFreeGeneration(id, lapsing.reservationId)).rejects.toThrow(
      'Free generation reservation expired'
    );
    // Read the stored counter, not the normalized view: normalizeGrant clamps to
    // the limit on read, so an 11th success would be invisible through the
    // status and admin surfaces that this hard invariant most needs to hold for.
    const stored = entries.get(id)?.data as { successful: number };
    expect(stored.successful).toBe(FREE_GENERATION_LIMIT);
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
