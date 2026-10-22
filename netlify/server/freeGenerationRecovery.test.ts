// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('./runtimeMode', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));

import { FREE_GENERATION_LIMIT } from '../../src/lib/freeGenerations';
import {
  completeFreeGeneration,
  failFreeGeneration,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  reserveDailyFreeGeneration,
  getDailyFreeGenerationStatus,
  getFreeGenerationGrantStatus,
  reserveFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  reserveRecoveryFreeGeneration,
  settleRecoveryFreeGeneration,
} from './freeGenerationGrants';
import {
  ADMITTED_AT,
  DAILY_KEY,
  INSTALLATION,
  createRecoveryLedgerTestFixture,
  expectAccepted,
  operation,
} from './freeGenerationRecoveryTestHarness';

let fixture: ReturnType<typeof createRecoveryLedgerTestFixture>;
beforeEach(() => {
  fixture = createRecoveryLedgerTestFixture();
  getStoreMock.mockReset().mockReturnValue(fixture.store());
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ADMITTED_AT));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('durable recovery free generation CAS accounting', () => {
  it('reserves a repeated stable operation once under actual shared CAS contention', async () => {
    const receipts = await Promise.all(
      Array.from({ length: 20 }, () => reserveRecoveryFreeGeneration(INSTALLATION, operation()))
    );
    expect(
      receipts.every((receipt) => JSON.stringify(receipt) === JSON.stringify(receipts[0]))
    ).toBe(true);
    expect(fixture.grant()).toMatchObject({ attempts: 1, successful: 0, failures: 0 });
    expect(Object.keys(fixture.grant().reservations)).toEqual([operation().operationId]);
    expect(getStoreMock).toHaveBeenCalledWith({
      name: 'free-generation-grants',
      consistency: 'strong',
    });
  });

  it('shares the ten-slot grant with legacy reservations under contention', async () => {
    const results = await Promise.all([
      reserveFreeGeneration(INSTALLATION),
      ...Array.from({ length: FREE_GENERATION_LIMIT }, (_, index) =>
        reserveRecoveryFreeGeneration(INSTALLATION, operation(index + 1))
      ),
    ]);
    expect(results.filter((receipt) => receipt.reserved)).toHaveLength(FREE_GENERATION_LIMIT);
    expect(fixture.grant()).toMatchObject({ attempts: FREE_GENERATION_LIMIT + 1, failures: 1 });
    expect(Object.keys(fixture.grant().reservations)).toHaveLength(FREE_GENERATION_LIMIT);
  });

  it('confirms the exact reservation after a committed write loses its acknowledgement', async () => {
    fixture.backend.dropAcknowledgementFor = INSTALLATION;
    const first = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expectAccepted(first);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(first);
    expect(fixture.grant().attempts).toBe(1);
  });

  it('confirms an exact daily start after a committed write loses its acknowledgement', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    fixture.backend.dropAcknowledgementFor = DAILY_KEY;
    const first = await reserveRecoveryDailyFreeGeneration(INSTALLATION, operation());
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      first
    );
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({ available: true, starts: 1 });
  });

  it('confirms an exact settlement after a committed write loses its acknowledgement', async () => {
    await fixture.fund();
    fixture.backend.dropAcknowledgementFor = INSTALLATION;
    const first = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).resolves.toEqual(first);
    expect(fixture.grant()).toMatchObject({
      successful: 1,
      attempts: 1,
      failures: 0,
      reservations: {},
    });
  });

  it('does not call an uncommitted write durable after a lost acknowledgement', async () => {
    const actual = fixture.store();
    actual.setJSON.mockRejectedValueOnce(new Error('Write failed before commit'));
    getStoreMock.mockReturnValue(actual);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'before commit'
    );
    expect(fixture.entries.has(INSTALLATION)).toBe(false);
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expect(fixture.grant().attempts).toBe(1);
  });

  it('preserves recovery receipts through unrelated legacy grant and daily mutations', async () => {
    const original = await fixture.fund();
    const legacy = await reserveFreeGeneration(INSTALLATION);
    if (!legacy.reserved) throw new Error('Expected legacy reservation');
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      original.reservation
    );
    await reserveDailyFreeGeneration();
    await completeFreeGeneration(INSTALLATION, legacy.reservationId);
    const settlement = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    await failFreeGeneration(INSTALLATION, 'invalid-request');
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      original.reservation
    );
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      original.daily
    );
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).resolves.toEqual(settlement);
    expect(fixture.grant()).toMatchObject({ successful: 2, attempts: 3, failures: 1 });
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({ available: true, starts: 2 });
  });

  it('charges one provider start for concurrent replay and keeps legacy starts in that counter', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    const results = await Promise.all([
      reserveDailyFreeGeneration(),
      ...Array.from({ length: 20 }, () =>
        reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())
      ),
    ]);
    expect(results.every((receipt) => receipt.reserved)).toBe(true);
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({ available: true, starts: 2 });
  });

  it('shares the final daily slots between legacy and recovery starts', async () => {
    fixture.seedDaily(FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - 2);
    await reserveRecoveryFreeGeneration(INSTALLATION, operation(1));
    await reserveRecoveryFreeGeneration(INSTALLATION, operation(2));
    const results = await Promise.all([
      reserveDailyFreeGeneration(),
      reserveRecoveryDailyFreeGeneration(INSTALLATION, operation(1)),
      reserveRecoveryDailyFreeGeneration(INSTALLATION, operation(2)),
    ]);
    expect(results.filter((receipt) => receipt.reserved)).toHaveLength(2);
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({
      available: false,
      starts: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
    });
  });

  it('never refunds a provider start after a failed generation', async () => {
    await fixture.fund();
    const receipt = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'failure',
      failureKind: 'upstream',
    });
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), {
        kind: 'failure',
        failureKind: 'upstream',
      })
    ).resolves.toEqual(receipt);
    expect(fixture.grant()).toMatchObject({ attempts: 1, failures: 1, successful: 0 });
    await expect(getDailyFreeGenerationStatus()).resolves.toEqual({ available: true, starts: 1 });
  });

  it('returns the first settlement receipt when competing outcomes settle one operation', async () => {
    await fixture.fund();
    const receipts = await Promise.all([
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' }),
      settleRecoveryFreeGeneration(INSTALLATION, operation(), {
        kind: 'failure',
        failureKind: 'safety',
      }),
    ]);
    expect(receipts[1]).toEqual(receipts[0]);
    expect(fixture.grant().successful + fixture.grant().failures).toBe(1);
  });

  it('replays a refused reservation after another operation releases a slot', async () => {
    const legacy = await Promise.all(
      Array.from({ length: FREE_GENERATION_LIMIT }, () => reserveFreeGeneration(INSTALLATION))
    );
    const refused = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expect(refused).toMatchObject({ reserved: false, reason: 'exhausted', remaining: 0 });
    const held = legacy[0];
    if (!held.reserved) throw new Error('Expected held reservation');
    await failFreeGeneration(INSTALLATION, 'safety', held.reservationId);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      refused
    );
    expect(fixture.grant()).toMatchObject({ attempts: FREE_GENERATION_LIMIT + 1, failures: 2 });
    await expect(getFreeGenerationGrantStatus(INSTALLATION)).resolves.toEqual({ remaining: 1 });
  });

  it('replays a daily ceiling refusal without charging attempts or failures again', async () => {
    fixture.seedDaily(FREE_GENERATION_DAILY_PROVIDER_START_LIMIT);
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    const refused = await reserveRecoveryDailyFreeGeneration(INSTALLATION, operation());
    expect(refused).toMatchObject({ reserved: false, reason: 'daily-limit', remaining: 0 });
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      refused
    );
    expect(fixture.grant()).toMatchObject({ attempts: 1, failures: 0 });
    await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'failure',
      failureKind: 'daily-limit',
    });
    expect(fixture.grant().failures).toBe(1);
  });

  it('fails closed without a durable store even in development', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('No durable store');
    });
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'No durable store'
    );
    expect(fixture.entries.size).toBe(0);
  });

  it('rejects a missing ETag before replaying a grant receipt or changing it', async () => {
    await fixture.fund();
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    fixture.backend.omitEtagFor = INSTALLATION;
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'nonempty ETag'
    );
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).rejects.toThrow('nonempty ETag');
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });

  it('rejects a missing ETag before replaying or charging a daily receipt', async () => {
    await fixture.fund();
    const before = structuredClone(fixture.entries.get(DAILY_KEY));
    fixture.backend.omitEtagFor = DAILY_KEY;
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'nonempty ETag'
    );
    expect(fixture.entries.get(DAILY_KEY)).toEqual(before);
  });
});
