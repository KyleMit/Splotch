// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$lib/server/runtimeMode', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));
import { FREE_RESERVATION_LEASE_MS } from '../ai/limits';
import {
  reserveFreeGeneration,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
} from './freeGenerationGrants';
import { RecoveryAccounting } from './generationAttemptAccounting';
import {
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  settleRecoveryFreeGeneration,
} from './freeGenerationGrants';
import {
  recoveryServiceFixture,
  SERVICE_TEST_TIME,
  type RecoveryServiceFixture,
} from './generationAttemptServiceTestHarness';
let fixture: RecoveryServiceFixture;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SERVICE_TEST_TIME);
  fixture = recoveryServiceFixture();
  getStoreMock.mockReset().mockReturnValue(fixture.ledger.store());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('recovery stable settlement authority', () => {
  it('rejects a real earlier abandoned receipt rather than delivering an uncounted free success', async () => {
    await fixture.raw();
    await fixture.runWorker();
    const record = await fixture.attempts.read(fixture.lookup);
    if (record.phase !== 'image') throw new Error('Fixture raw image is missing');
    vi.setSystemTime(SERVICE_TEST_TIME + FREE_RESERVATION_LEASE_MS);
    await reserveFreeGeneration(fixture.credential.identity);
    await expect(fixture.accounting.settle(record, fixture.credential)).rejects.toMatchObject({
      code: 'RECOVERY_UNAVAILABLE',
    });
    expect(fixture.ledger.grant().successful).toBe(0);
    expect(
      fixture.ledger.grant().recoveryOperations[fixture.identity.id].settlement?.outcome
    ).toEqual({ kind: 'failure', failureKind: 'abandoned' });
  });
  it('a lost daily receipt acknowledgement still yields one stable funding receipt', async () => {
    fixture.ledger.backend.dropAcknowledgementFor = 'daily-provider-starts/2026-10-12';
    await fixture.raw();
    const record = await fixture.attempts.read(fixture.lookup);
    const first = await fixture.accounting.fund(record, fixture.credential);
    const second = await fixture.accounting.fund(record, fixture.credential);
    expect(second).toEqual(first);
    expect(fixture.ledger.entries.get('daily-provider-starts/2026-10-12')?.data).toMatchObject({
      starts: 1,
    });
  });
  it('a shared daily refusal never marks the attempt pending or refunds a daily start', async () => {
    fixture.ledger.seedDaily(FREE_GENERATION_DAILY_PROVIDER_START_LIMIT);
    expect((await fixture.raw()).status).toBe(503);
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('preparing');
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect(fixture.ledger.entries.get('daily-provider-starts/2026-10-12')?.data).toMatchObject({
      starts: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
    });
    expect(fixture.ledger.grant().failures).toBe(1);
  });
  it('refusal settlement receipt is stable across reconciliation without a daily refund', async () => {
    vi.mocked(fixture.provider.generateImage).mockResolvedValue({
      kind: 'refusal',
      reason: 'Fixture refusal',
    });
    await fixture.raw();
    await fixture.runWorker();
    const record = await fixture.attempts.read(fixture.lookup);
    if (record.phase !== 'refusal') throw new Error('Fixture refusal is missing');
    const first = await fixture.accounting.settle(record, fixture.credential);
    expect(await fixture.accounting.settle(record, fixture.credential)).toEqual(first);
    expect(fixture.ledger.grant().failures).toBe(1);
    expect(fixture.ledger.entries.get('daily-provider-starts/2026-10-12')?.data).toMatchObject({
      starts: 1,
    });
  });
  it('managed settlement binds funding and immutable outcome independently of tally availability', async () => {
    const managed = recoveryServiceFixture({ kind: 'managed', identity: 'fixture-managed' });
    getStoreMock.mockReturnValue(managed.ledger.store());
    await managed.raw();
    await managed.runWorker();
    const record = await managed.attempts.read(managed.lookup);
    if (record.phase !== 'image') throw new Error('Fixture raw image is missing');
    const accounting = new RecoveryAccounting({
      reserve: reserveRecoveryFreeGeneration,
      reserveDaily: reserveRecoveryDailyFreeGeneration,
      settle: settleRecoveryFreeGeneration,
    });
    const receipt = await accounting.settle(record, managed.credential);
    expect(await accounting.settle(record, managed.credential)).toEqual(receipt);
    expect(receipt.remaining).toBeNull();
    expect(receipt.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    const changedFunding = await accounting.settle(
      { ...record, funding: { ...record.funding, receiptDigest: 'e'.repeat(64) } },
      managed.credential
    );
    const changedOutcome = await accounting.settle(
      { ...record, image: { ...record.image, digest: 'f'.repeat(64) } },
      managed.credential
    );
    expect(changedFunding.receiptDigest).not.toBe(receipt.receiptDigest);
    expect(changedOutcome.receiptDigest).not.toBe(receipt.receiptDigest);
  });
});

it('returns the confirmed stable failure outcome with the settlement digest', async () => {
  const fixture = recoveryServiceFixture();
  getStoreMock.mockReturnValue(fixture.ledger.store());
  await fixture.raw();
  const claim = await fixture.attempts.claim(fixture.identity.id);
  await fixture.attempts.complete(
    fixture.identity.id,
    claim!.claimId,
    { phase: 'refusal', reason: 'Fixture safety reason' },
    null
  );
  const record = await fixture.attempts.read(fixture.lookup);
  if (record.phase !== 'refusal') throw new Error('Fixture did not refuse');
  const settlement = await fixture.accounting.settle(record, fixture.credential);
  expect(settlement.outcome).toEqual({ kind: 'failure', failureKind: 'safety' });
  expect(settlement.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(fixture.ledger.grant().failures).toBe(1);
});
