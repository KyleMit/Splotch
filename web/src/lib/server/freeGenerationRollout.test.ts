// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$lib/server/runtimeMode', () => ({ dev: false }));
vi.mock('./sleep', () => ({ sleep: async () => {} }));

import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
import {
  reserveFreeGeneration,
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  settleRecoveryFreeGeneration,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
} from './freeGenerationGrants';
import { recoveryOperationTiming } from './freeGenerationRecoveryReceipts';
import {
  ADMITTED_AT,
  DAILY_KEY,
  INSTALLATION,
  expectAccepted,
  operation,
} from './freeGenerationRecoveryTestHarness';
import {
  createRolloutFixture,
  expectFreshLegacyMutation,
  preservationWriter,
} from './freeGenerationRolloutTestHarness';

const AFTER_LEASE_OFFSET_MS = 1;
let fixture: ReturnType<typeof createRolloutFixture>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ADMITTED_AT));
  fixture = createRolloutFixture();
  getStoreMock.mockReset().mockReturnValue(fixture.store);
});
afterEach(() => {
  vi.useRealTimers();
});

async function admitAndStart() {
  const reservation = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
  expectAccepted(reservation);
  const daily = await reserveRecoveryDailyFreeGeneration(INSTALLATION, operation());
  return { reservation, daily };
}

async function exhaustAndDeny() {
  const held: string[] = [];
  for (let index = 0; index < FREE_GENERATION_LIMIT; index++) {
    const reservation = await reserveFreeGeneration(INSTALLATION);
    if (!reservation.reserved) throw new Error('Expected a legacy held slot');
    held.push(reservation.reservationId);
  }
  const denied = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
  return { held, denied };
}

function advancePastLease() {
  const timing = recoveryOperationTiming(operation());
  vi.setSystemTime(new Date(new Date(timing.expiresAt).getTime() + AFTER_LEASE_OFFSET_MS));
  return timing;
}

describe('rollout conditional-store controls', () => {
  it('rejects a stale ETag without replacing data or advancing its ETag', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(
      fixture.store.setJSON(INSTALLATION, { erased: true }, { onlyIfMatch: 'stale-control' })
    ).resolves.toEqual({ modified: false });
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });

  it('rejects onlyIfNew for an existing record without replacing it', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(
      fixture.store.setJSON(INSTALLATION, { erased: true }, { onlyIfNew: true })
    ).resolves.toEqual({ modified: false });
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });
});

describe('frozen-old writer fresh-ETag counterexamples', () => {
  it('erases the daily map and charges the same pending operation again', async () => {
    const first = await admitAndStart();
    const grantBefore = fixture.raw(INSTALLATION);
    const before = fixture.checkpoint(DAILY_KEY);
    await expect(fixture.frozen.reserveDailyFreeGeneration()).resolves.toEqual({
      reserved: true,
      remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - 2,
    });
    expectFreshLegacyMutation(fixture, DAILY_KEY, before);
    expect(fixture.raw(DAILY_KEY)).not.toHaveProperty('recoveryStarts');
    const replay = await reserveRecoveryDailyFreeGeneration(INSTALLATION, operation());
    expect(replay).toEqual({
      ...first.daily,
      remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - 3,
    });
    expect(replay).not.toEqual(first.daily);
    expect(fixture.raw(DAILY_KEY).starts).toBe(3);
    expect(fixture.writes).toHaveLength(before.writes + 2);
    expect(fixture.raw(INSTALLATION)).toEqual(grantBefore);
  });

  it('erases a denied admission and admits that stable operation after a slot is freed', async () => {
    const first = await exhaustAndDeny();
    expect(first.denied).toMatchObject({ reserved: false, reason: 'exhausted', remaining: 0 });
    const before = fixture.checkpoint(INSTALLATION);
    await fixture.frozen.failFreeGeneration(INSTALLATION, 'upstream', first.held[0]);
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION)).not.toHaveProperty('recoveryOperations');
    const replay = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expectAccepted(replay);
    expect(replay).not.toEqual(first.denied);
    expect(fixture.grant()).toMatchObject({ attempts: FREE_GENERATION_LIMIT + 2, failures: 2 });
    expect(fixture.writes).toHaveLength(before.writes + 2);
  });

  it('erases the first success settlement and loses stable reconciliation', async () => {
    await admitAndStart();
    const first = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    expect(first.outcome).toEqual({ kind: 'success' });
    const before = fixture.checkpoint(INSTALLATION);
    await fixture.frozen.failFreeGeneration(INSTALLATION, 'invalid-request');
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION)).not.toHaveProperty('recoveryOperations');
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), {
        kind: 'failure',
        failureKind: 'upstream',
      })
    ).rejects.toThrow('Recovery free generation reservation was not accepted');
    expect(fixture.grant()).toMatchObject({ successful: 1, failures: 1, attempts: 2 });
    expect(fixture.writes).toHaveLength(before.writes + 1);
  });

  it('reclaims the expired hold while erasing the stable abandonment proof', async () => {
    const reservation = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expectAccepted(reservation);
    advancePastLease();
    const before = fixture.checkpoint(INSTALLATION);
    await fixture.frozen.failFreeGeneration(INSTALLATION, 'invalid-request');
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION)).not.toHaveProperty('recoveryOperations');
    expect(fixture.raw(INSTALLATION).reservations).toEqual({});
    expect(fixture.grant()).toMatchObject({ successful: 0, failures: 2, attempts: 2 });
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).rejects.toThrow('Recovery free generation reservation was not accepted');
    expect(fixture.writes).toHaveLength(before.writes + 1);
  });
});

describe('current writer preservation assertions', () => {
  it('preserves the exact pending map through a legacy reserve and successful completion', async () => {
    const first = await admitAndStart();
    const grantMap = fixture.raw(INSTALLATION).recoveryOperations;
    const dailyBefore = fixture.raw(DAILY_KEY);
    const writer = preservationWriter(fixture.frozen);
    const before = fixture.checkpoint(INSTALLATION);
    const legacy = await writer.reserveFreeGeneration(INSTALLATION);
    expect(legacy.reserved).toBe(true);
    if (!legacy.reserved) throw new Error('Expected a legacy reservation');
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    const held = fixture.checkpoint(INSTALLATION);
    await writer.completeFreeGeneration(INSTALLATION, legacy.reservationId);
    expectFreshLegacyMutation(fixture, INSTALLATION, held);
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      first.reservation
    );
    expect(fixture.raw(DAILY_KEY)).toEqual(dailyBefore);
    expect(fixture.grant()).toMatchObject({ successful: 1, failures: 0, attempts: 2 });
    expect(fixture.writes).toHaveLength(before.writes + 2);
  });

  it('preserves the exact daily map and replays the original daily charge without a write', async () => {
    const first = await admitAndStart();
    const dailyMap = fixture.raw(DAILY_KEY).recoveryStarts;
    const grantBefore = fixture.raw(INSTALLATION);
    const before = fixture.checkpoint(DAILY_KEY);
    await preservationWriter(fixture.frozen).reserveDailyFreeGeneration();
    expectFreshLegacyMutation(fixture, DAILY_KEY, before);
    expect(fixture.raw(DAILY_KEY).recoveryStarts).toEqual(dailyMap);
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      first.daily
    );
    expect(fixture.raw(DAILY_KEY).starts).toBe(2);
    expect(fixture.raw(INSTALLATION)).toEqual(grantBefore);
    expect(fixture.writes).toHaveLength(before.writes + 1);
  });

  it('preserves the exact denied map and the historical refusal after a slot is freed', async () => {
    const first = await exhaustAndDeny();
    expect(first.denied).toMatchObject({ reserved: false, reason: 'exhausted', remaining: 0 });
    const grantMap = fixture.raw(INSTALLATION).recoveryOperations;
    const before = fixture.checkpoint(INSTALLATION);
    await preservationWriter(fixture.frozen).failFreeGeneration(
      INSTALLATION,
      'upstream',
      first.held[0]
    );
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      first.denied
    );
    expect(fixture.grant()).toMatchObject({ attempts: FREE_GENERATION_LIMIT + 1, failures: 2 });
    expect(fixture.writes).toHaveLength(before.writes + 1);
  });

  it('preserves the exact settled map and returns the first success against a competing outcome', async () => {
    await admitAndStart();
    const first = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    const grantMap = fixture.raw(INSTALLATION).recoveryOperations;
    const dailyBefore = fixture.raw(DAILY_KEY);
    const before = fixture.checkpoint(INSTALLATION);
    await preservationWriter(fixture.frozen).failFreeGeneration(INSTALLATION, 'invalid-request');
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), {
        kind: 'failure',
        failureKind: 'upstream',
      })
    ).resolves.toEqual(first);
    expect(fixture.grant()).toMatchObject({ successful: 1, failures: 1, attempts: 2 });
    expect(fixture.raw(DAILY_KEY)).toEqual(dailyBefore);
    expect(fixture.writes).toHaveLength(before.writes + 1);
  });

  it('preserves immutable expiry timing and the exact abandonment map through another legacy mutation', async () => {
    const reservation = await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    expectAccepted(reservation);
    const timing = advancePastLease();
    const expected = {
      ...timing,
      outcome: { kind: 'failure', failureKind: 'abandoned' },
      settledAt: timing.expiresAt,
      remaining: FREE_GENERATION_LIMIT,
    };
    const before = fixture.checkpoint(INSTALLATION);
    const writer = preservationWriter(fixture.frozen);
    await writer.failFreeGeneration(INSTALLATION, 'invalid-request');
    expectFreshLegacyMutation(fixture, INSTALLATION, before);
    const grantMap = { [operation().operationId]: { reservation, settlement: expected } };
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    const afterExpiry = fixture.checkpoint(INSTALLATION);
    await writer.failFreeGeneration(INSTALLATION, 'upstream');
    expectFreshLegacyMutation(fixture, INSTALLATION, afterExpiry);
    expect(fixture.raw(INSTALLATION).recoveryOperations).toEqual(grantMap);
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).resolves.toEqual(expected);
    expect(fixture.grant()).toMatchObject({ successful: 0, failures: 3, attempts: 3 });
    expect(fixture.raw(INSTALLATION).reservations).toEqual({});
    expect(fixture.writes).toHaveLength(before.writes + 2);
  });
});
