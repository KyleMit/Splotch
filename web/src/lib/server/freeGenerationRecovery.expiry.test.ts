// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));

import { FREE_RESERVATION_LEASE_MS } from '$lib/ai/limits';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
import {
  completeFreeGeneration,
  failFreeGeneration,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  getFreeGenerationGrantStatus,
  reserveFreeGeneration,
  reserveDailyFreeGeneration,
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

import { normalizeDailyProviderStarts } from './freeGenerationLedger';
import {
  RECOVERY_DAILY_RECEIPT_LIMIT,
  RECOVERY_GRANT_RECEIPT_LIMIT,
  type RecoveryGrantOperation,
  type RecoveryFreeGenerationSettlementReceipt,
  type RecoveryDailyFreeGenerationReceipt,
} from './freeGenerationRecoveryReceipts';

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

describe('recovery free generation receipt lifetime and capacity', () => {
  it('rejects a changed admission rather than shifting expiry or charging a second day', async () => {
    await fixture.fund();
    const changed = operation(1, '2026-10-12T12:00:01.000Z');
    vi.setSystemTime(new Date(changed.admittedAt));
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, changed)).rejects.toThrow('conflicts');
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, changed)).rejects.toThrow(
      'conflicts'
    );
    expect(fixture.grant().attempts).toBe(1);
  });

  it('replays an already charged daily start across UTC midnight using its original date', async () => {
    vi.setSystemTime(new Date('2026-10-12T23:59:59.000Z'));
    const input = operation(1, new Date().toISOString());
    const original = await fixture.fund(input);
    vi.setSystemTime(new Date('2026-10-13T00:00:01.000Z'));
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, input)).resolves.toEqual(
      original.daily
    );
    expect(fixture.entries.has('daily-provider-starts/2026-10-13')).toBe(false);
    expect(fixture.entries.get(DAILY_KEY)?.data).toMatchObject({ starts: 1 });
  });

  it('refuses an uncharged first provider start after the original UTC day ends', async () => {
    vi.setSystemTime(new Date('2026-10-12T23:59:59.000Z'));
    const input = operation(1, new Date().toISOString());
    await reserveRecoveryFreeGeneration(INSTALLATION, input);
    vi.setSystemTime(new Date('2026-10-13T00:00:01.000Z'));
    const refused = await reserveRecoveryDailyFreeGeneration(INSTALLATION, input);
    expect(refused).toMatchObject({ reserved: false, reason: 'day-ended' });
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, input)).resolves.toEqual(refused);
    expect(fixture.entries.get(DAILY_KEY)?.data).toMatchObject({ starts: 0 });
    expect(fixture.entries.has('daily-provider-starts/2026-10-13')).toBe(false);
  });

  it('replays a completed reservation and settlement after its lease expires', async () => {
    const original = await fixture.fund();
    const settled = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    vi.setSystemTime(new Date(ADMITTED_AT).getTime() + FREE_RESERVATION_LEASE_MS + 1);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      original.reservation
    );
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).resolves.toEqual(settled);
    expect(fixture.grant()).toMatchObject({ attempts: 1, successful: 1, failures: 0 });
  });

  it('books abandonment once and cannot let a reclaimed slot count as another success', async () => {
    await fixture.fund();
    vi.setSystemTime(new Date(ADMITTED_AT).getTime() + FREE_RESERVATION_LEASE_MS + 1);
    const next = operation(2, new Date().toISOString());
    await fixture.fund(next);
    const abandoned = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    expect(abandoned.outcome).toEqual({ kind: 'failure', failureKind: 'abandoned' });
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).resolves.toEqual(abandoned);
    await settleRecoveryFreeGeneration(INSTALLATION, next, { kind: 'success' });
    expect(fixture.grant()).toMatchObject({ attempts: 2, failures: 1, successful: 1 });
    expect(fixture.entries.get(DAILY_KEY)?.data).toMatchObject({ starts: 2 });
  });

  it('keeps the raw success count at ten when a legacy request spends a reclaimed recovery slot', async () => {
    for (let index = 1; index < FREE_GENERATION_LIMIT; index++) {
      const legacy = await reserveFreeGeneration(INSTALLATION);
      if (!legacy.reserved) throw new Error('Expected legacy reservation');
      await completeFreeGeneration(INSTALLATION, legacy.reservationId);
    }
    await fixture.fund();
    vi.setSystemTime(new Date(ADMITTED_AT).getTime() + FREE_RESERVATION_LEASE_MS + 1);
    const replacement = await reserveFreeGeneration(INSTALLATION);
    if (!replacement.reserved) throw new Error('Expected reclaimed slot');
    await completeFreeGeneration(INSTALLATION, replacement.reservationId);
    const late = await settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' });
    expect(late.outcome).toEqual({ kind: 'failure', failureKind: 'abandoned' });
    expect(fixture.entries.get(INSTALLATION)?.data).toMatchObject({
      successful: FREE_GENERATION_LIMIT,
    });
    await expect(getFreeGenerationGrantStatus(INSTALLATION)).resolves.toEqual({ remaining: 0 });
  });

  it('settles an expired unstarted reservation as abandonment without requiring a daily start', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    vi.setSystemTime(new Date(ADMITTED_AT).getTime() + FREE_RESERVATION_LEASE_MS + 1);
    const receipt = await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'success',
    });
    expect(receipt.outcome).toEqual({ kind: 'failure', failureKind: 'abandoned' });
    expect(receipt.settledAt).toBe(receipt.expiresAt);
    expect(fixture.grant()).toMatchObject({ failures: 1, successful: 0 });
    expect(fixture.entries.has(DAILY_KEY)).toBe(false);
  });

  it('rejects explicit abandonment before the lease expires without corrupting its receipt', async () => {
    await fixture.fund();
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), {
        kind: 'failure',
        failureKind: 'abandoned',
      })
    ).rejects.toThrow('requires an expired');
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });

  it('does not record a success without a confirmed daily start', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).rejects.toThrow('start was not accepted');
    expect(fixture.grant()).toMatchObject({ successful: 0, failures: 0 });
  });

  it('rejects a new daily charge for an operation already settled as failed', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    await settleRecoveryFreeGeneration(INSTALLATION, operation(), {
      kind: 'failure',
      failureKind: 'upstream',
    });
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'no longer pending'
    );
    expect(fixture.entries.has(DAILY_KEY)).toBe(false);
  });

  it('protects retained grant receipts at capacity and admits again after their horizon', async () => {
    for (let index = 1; index <= RECOVERY_GRANT_RECEIPT_LIMIT; index++) {
      await reserveRecoveryFreeGeneration(INSTALLATION, operation(index));
      await settleRecoveryFreeGeneration(INSTALLATION, operation(index), {
        kind: 'failure',
        failureKind: 'safety',
      });
    }
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(
      reserveRecoveryFreeGeneration(INSTALLATION, operation(RECOVERY_GRANT_RECEIPT_LIMIT + 1))
    ).rejects.toThrow('capacity');
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
    const retainUntil =
      fixture.grant().recoveryOperations[operation().operationId].reservation.retainUntil;
    vi.setSystemTime(new Date(retainUntil).getTime() + 1);
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'retention window'
    );
    const admitted = await reserveRecoveryFreeGeneration(
      INSTALLATION,
      operation(RECOVERY_GRANT_RECEIPT_LIMIT + 1, new Date().toISOString())
    );
    expectAccepted(admitted);
    expect(Object.keys(fixture.grant().recoveryOperations)).toHaveLength(1);
  });

  it('rejects daily receipt overflow without evicting a retained refusal', async () => {
    fixture.seedDaily(FREE_GENERATION_DAILY_PROVIDER_START_LIMIT);
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    const template = await reserveRecoveryDailyFreeGeneration(INSTALLATION, operation());
    const recoveryStarts = Object.fromEntries(
      Array.from({ length: RECOVERY_DAILY_RECEIPT_LIMIT }, (_, index) => {
        const operationId = operation(index + 1).operationId;
        return [operationId, { ...template, operationId }];
      })
    );
    fixture.entries.set(DAILY_KEY, {
      data: {
        version: 1,
        date: '2026-10-12',
        starts: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
        recoveryStarts,
      },
      etag: 'full',
    });
    const next = operation(RECOVERY_DAILY_RECEIPT_LIMIT + 1);
    await reserveRecoveryFreeGeneration(INSTALLATION, next);
    const before = structuredClone(fixture.entries.get(DAILY_KEY));
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, next)).rejects.toThrow(
      'capacity'
    );
    expect(fixture.entries.get(DAILY_KEY)).toEqual(before);
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).resolves.toEqual(
      template
    );
  });

  it('fails loudly on malformed recovery fields even through a legacy writer', async () => {
    fixture.entries.set(INSTALLATION, {
      data: { recoveryOperations: { bad: {} } },
      etag: 'malformed',
    });
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(reserveFreeGeneration(INSTALLATION)).rejects.toThrow('Invalid recovery');
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });

  it('fails closed when a retained daily start disagrees with its charged counter', async () => {
    await fixture.fund();
    const daily = fixture.entries.get(DAILY_KEY);
    if (!daily || typeof daily.data !== 'object' || daily.data === null)
      throw new Error('Expected daily ledger');
    fixture.entries.set(DAILY_KEY, { ...daily, data: { ...daily.data, starts: 0 } });
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'disagree'
    );
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).rejects.toThrow('disagree');
    expect(fixture.grant().successful).toBe(0);
  });

  it('prevents a legacy completion from bypassing recovery settlement receipts', async () => {
    await reserveRecoveryFreeGeneration(INSTALLATION, operation());
    await expect(completeFreeGeneration(INSTALLATION, operation().operationId)).rejects.toThrow(
      'requires recovery settlement'
    );
    await expect(
      failFreeGeneration(INSTALLATION, 'upstream', operation().operationId)
    ).rejects.toThrow('requires recovery settlement');
    expect(fixture.grant()).toMatchObject({ failures: 0, successful: 0 });
  });
  it.each([
    {
      name: 'an extra operation field',
      corrupt: (entry: RecoveryGrantOperation) => Object.assign(entry, { extra: true }),
    },
    {
      name: 'an extra reservation field',
      corrupt: (entry: RecoveryGrantOperation) => Object.assign(entry.reservation, { extra: true }),
    },
    {
      name: 'an unsafe reservation remaining',
      corrupt: (entry: RecoveryGrantOperation) =>
        Object.assign(entry.reservation, { remaining: Number.MAX_SAFE_INTEGER + 1 }),
    },
    {
      name: 'an above-limit reservation remaining',
      corrupt: (entry: RecoveryGrantOperation) =>
        Object.assign(entry.reservation, { remaining: FREE_GENERATION_LIMIT + 1 }),
    },
    {
      name: 'a shifted reservation expiry',
      corrupt: (entry: RecoveryGrantOperation) =>
        Object.assign(entry.reservation, { expiresAt: '2026-10-12T12:22:00.000Z' }),
    },
  ])('rejects $name without rewriting its shared grant record', async ({ corrupt }) => {
    await fixture.fund();
    const stored = fixture.grant();
    corrupt(stored.recoveryOperations[operation().operationId]);
    fixture.entries.set(INSTALLATION, { data: stored, etag: 'corrupt' });
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(reserveRecoveryFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'Invalid recovery'
    );
    await expect(reserveFreeGeneration(INSTALLATION)).rejects.toThrow('Invalid recovery');
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });

  it.each([
    {
      name: 'an extra settlement field',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt, { extra: true }),
    },
    {
      name: 'an extra success-outcome field',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt.outcome, { extra: true }),
    },
    {
      name: 'a fractional settlement remaining',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt, { remaining: 0.5 }),
    },
    {
      name: 'an above-limit settlement remaining',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt, { remaining: FREE_GENERATION_LIMIT + 1 }),
    },
    {
      name: 'a settlement before admission',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt, { settledAt: '2026-10-12T11:59:59.999Z' }),
    },
    {
      name: 'a settlement after retention',
      corrupt: (receipt: RecoveryFreeGenerationSettlementReceipt) =>
        Object.assign(receipt, {
          settledAt: new Date(new Date(receipt.retainUntil).getTime() + 1).toISOString(),
        }),
    },
  ])('rejects $name before replaying a settlement', async ({ corrupt }) => {
    await fixture.fund();
    await settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' });
    const stored = fixture.grant();
    const settlement = stored.recoveryOperations[operation().operationId].settlement;
    if (!settlement) throw new Error('Expected stored settlement');
    corrupt(settlement);
    fixture.entries.set(INSTALLATION, { data: stored, etag: 'corrupt' });
    await expect(
      settleRecoveryFreeGeneration(INSTALLATION, operation(), { kind: 'success' })
    ).rejects.toThrow('Invalid recovery');
  });

  it.each([
    {
      name: 'an extra daily receipt field',
      corrupt: (receipt: RecoveryDailyFreeGenerationReceipt) =>
        Object.assign(receipt, { extra: true }),
    },
    {
      name: 'an unsafe daily remaining',
      corrupt: (receipt: RecoveryDailyFreeGenerationReceipt) =>
        Object.assign(receipt, { remaining: Number.MAX_SAFE_INTEGER + 1 }),
    },
    {
      name: 'an above-limit daily remaining',
      corrupt: (receipt: RecoveryDailyFreeGenerationReceipt) =>
        Object.assign(receipt, { remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT + 1 }),
    },
    {
      name: 'a shifted daily date',
      corrupt: (receipt: RecoveryDailyFreeGenerationReceipt) =>
        Object.assign(receipt, { dailyDate: '2026-10-13' }),
    },
  ])('rejects $name through recovery and legacy writers', async ({ corrupt }) => {
    await fixture.fund();
    const stored = normalizeDailyProviderStarts(fixture.entries.get(DAILY_KEY)?.data, '2026-10-12');
    corrupt(stored.recoveryStarts[operation().operationId]);
    fixture.entries.set(DAILY_KEY, { data: stored, etag: 'corrupt' });
    const before = structuredClone(fixture.entries.get(DAILY_KEY));
    await expect(reserveRecoveryDailyFreeGeneration(INSTALLATION, operation())).rejects.toThrow(
      'Invalid recovery'
    );
    await expect(reserveDailyFreeGeneration()).rejects.toThrow('Invalid recovery');
    expect(fixture.entries.get(DAILY_KEY)).toEqual(before);
  });

  it('rejects an extra outcome key before writing an otherwise valid settlement', async () => {
    await fixture.fund();
    const outcome = { kind: 'success' as const, extra: true };
    const before = structuredClone(fixture.entries.get(INSTALLATION));
    await expect(settleRecoveryFreeGeneration(INSTALLATION, operation(), outcome)).rejects.toThrow(
      'Invalid recovery'
    );
    expect(fixture.entries.get(INSTALLATION)).toEqual(before);
  });
});
