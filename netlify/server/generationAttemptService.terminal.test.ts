// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('./runtimeMode', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));
import { INSTALLATION_ID_HEADER } from '../../src/lib/apiHeaders';
import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_TTL_MS,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_TERMINAL_STATUS,
  parseRecoveryTerminalReply,
  RecoveryFault,
} from '../../src/lib/ai/generationAttempt';
import { createRecoveryAttemptHandlers } from './generationAttemptService';
import { recoveryServiceEnabled } from './generationAttemptPolicy';
import {
  recoveryServiceFixture,
  SERVICE_TEST_TIME,
  type RecoveryServiceFixture,
} from './generationAttemptServiceTestHarness';
const REPLAY_DELAY_MS = 90_000;
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
const checkedHeaders = { [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE };
function checkedReconcile() {
  return fixture.invoke(
    new Request(`https://splotch.test${RECOVERY_PATH}`, {
      method: 'POST',
      headers: {
        ...checkedHeaders,
        'Content-Type': 'application/json',
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
        [INSTALLATION_ID_HEADER]: fixture.credential.identity,
      },
      body: JSON.stringify({
        operation: 'reconcile',
        id: fixture.identity.id,
        createdAt: fixture.identity.createdAt,
      }),
    })
  );
}
describe('checked terminal proof source proposal', () => {
  it('reads authenticated original expiry metadata without bytes, settlement, cleanup or dispatch', async () => {
    await fixture.raw();
    await fixture.runWorker();
    await fixture.reconcile();
    const first = await fixture.attempts.read(fixture.lookup);
    const writes = fixture.storage.operations.filter((op) => !op.startsWith('read:'));
    const ledger = structuredClone([...fixture.ledger.entries]);
    fixture.dispatch.mockClear();
    fixture.prepare.mockClear();
    fixture.reportToken.mockClear();
    fixture.authorize.mockClear();
    vi.mocked(fixture.provider.generateImage).mockClear();
    vi.mocked(fixture.provider.verifyKey).mockClear();
    const fund = vi.spyOn(fixture.accounting, 'fund');
    const settle = vi.spyOn(fixture.accounting, 'settle');
    const readDelivery = vi.spyOn(fixture.attempts, 'readDelivery');
    const readRaw = vi.spyOn(fixture.attempts, 'readRawImage');
    vi.setSystemTime(first.admission.expiresAt);
    const response = await fixture.get(checkedHeaders);
    const value: unknown = await response.json();
    expect(response.status).toBe(410);
    expect(
      parseRecoveryTerminalReply(response.status, value, {
        ...fixture.identity,
        expiry: { kind: 'known', expiresAt: first.admission.expiresAt },
      }).body.outcome
    ).toBe('expired');
    expect(response.headers.get(RECOVERY_EXPIRES_HEADER)).toBe(String(first.admission.expiresAt));
    expect(fixture.storage.operations.filter((op) => !op.startsWith('read:'))).toEqual(writes);
    expect([...fixture.ledger.entries]).toEqual(ledger);
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.reportToken).not.toHaveBeenCalled();
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect(fixture.provider.verifyKey).not.toHaveBeenCalled();
    expect(fund).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(readDelivery).not.toHaveBeenCalled();
    expect(readRaw).not.toHaveBeenCalled();
    vi.setSystemTime(first.admission.expiresAt + REPLAY_DELAY_MS);
    expect(await (await fixture.get(checkedHeaders)).json()).toEqual(value);
    expect((await fixture.get()).status).toBe(404);
  });
  it('cannot prove expiry from absent metadata, a read failure or another original credential', async () => {
    expect((await fixture.get(checkedHeaders)).status).toBe(404);
    await fixture.raw();
    vi.setSystemTime(SERVICE_TEST_TIME + RECOVERY_TTL_MS);
    expect(
      (await fixture.get({ ...checkedHeaders, [INSTALLATION_ID_HEADER]: 'c'.repeat(64) })).status
    ).toBe(409);
    fixture.storage.readFailures.add(`${fixture.identity.id}/record`);
    expect((await fixture.get(checkedHeaders)).status).toBe(503);
    fixture.storage.readFailures.clear();
    fixture.storage.entries.delete(`${fixture.identity.id}/record`);
    const absent = await fixture.get(checkedHeaders);
    expect(await absent.json()).toMatchObject({ code: 'RECOVERY_ABSENT' });
  });
  it.each(['refusal', 'error'] as const)(
    'confirms immediate reconcile %s only after stable settlement and exact reread',
    async (outcome) => {
      await fixture.raw();
      const claim = await fixture.attempts.claim(fixture.identity.id);
      expect(claim).not.toBeNull();
      await fixture.attempts.complete(
        fixture.identity.id,
        claim!.claimId,
        { phase: outcome, reason: 'Fixture terminal reason' },
        null
      );
      const before = await fixture.attempts.read(fixture.lookup);
      const response = await checkedReconcile();
      const value: unknown = await response.json();
      expect(
        parseRecoveryTerminalReply(response.status, value, {
          ...fixture.identity,
          expiry: { kind: 'known', expiresAt: before.admission.expiresAt },
        }).body.outcome
      ).toBe(outcome);
      expect(response.status).toBe(RECOVERY_TERMINAL_STATUS[outcome]);
      expect(fixture.ledger.grant().failures).toBe(1);
      expect(await (await checkedReconcile()).json()).toEqual(value);
      expect(fixture.ledger.grant().failures).toBe(1);
      expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    }
  );
  it.each(['refusal', 'error'] as const)(
    'returns the original checked %s proof from explicit duplicate raw admission',
    async (outcome) => {
      await fixture.raw();
      const claim = await fixture.attempts.claim(fixture.identity.id);
      await fixture.attempts.complete(
        fixture.identity.id,
        claim!.claimId,
        { phase: outcome, reason: 'Fixture duplicate outcome' },
        null
      );
      const first = await fixture.attempts.read(fixture.lookup);
      fixture.authorize.mockClear();
      fixture.dispatch.mockClear();
      const response = await fixture.raw(checkedHeaders);
      expect(
        parseRecoveryTerminalReply(response.status, await response.json(), {
          ...fixture.identity,
          expiry: { kind: 'known', expiresAt: first.admission.expiresAt },
        }).body.outcome
      ).toBe(outcome);
      expect(fixture.ledger.grant().failures).toBe(1);
      expect(fixture.authorize).not.toHaveBeenCalled();
      expect(fixture.dispatch).not.toHaveBeenCalled();
      expect((await fixture.attempts.read(fixture.lookup)).admission).toEqual(first.admission);
    }
  );
  it('refuses a successful or malformed settlement return for a checked failure', async () => {
    await fixture.raw();
    const claim = await fixture.attempts.claim(fixture.identity.id);
    await fixture.attempts.complete(
      fixture.identity.id,
      claim!.claimId,
      { phase: 'error', reason: 'Fixture failure' },
      null
    );
    const record = await fixture.attempts.read(fixture.lookup);
    if (record.phase !== 'error') throw new Error('Fixture did not complete');
    const confirmed = await fixture.accounting.settle(record, fixture.credential);
    const settle = vi
      .spyOn(fixture.accounting, 'settle')
      .mockResolvedValueOnce({ ...confirmed, outcome: { kind: 'success' } });
    expect((await checkedReconcile()).status).toBe(503);
    settle.mockResolvedValueOnce({ ...confirmed, receiptDigest: '' });
    expect((await checkedReconcile()).status).toBe(503);
    settle.mockResolvedValueOnce({
      ...confirmed,
      outcome: { kind: 'failure', failureKind: 'safety' },
    });
    expect((await checkedReconcile()).status).toBe(503);
    expect(fixture.reportToken).not.toHaveBeenCalled();
  });
  it('withholds terminal proof when settlement or authoritative original outcome reread fails', async () => {
    await fixture.raw();
    const claim = await fixture.attempts.claim(fixture.identity.id);
    await fixture.attempts.complete(
      fixture.identity.id,
      claim!.claimId,
      { phase: 'error', reason: 'Fixture failure' },
      null
    );
    const settle = vi
      .spyOn(fixture.accounting, 'settle')
      .mockRejectedValueOnce(new RecoveryFault('RECOVERY_UNAVAILABLE'));
    expect((await checkedReconcile()).status).toBe(503);
    expect(settle).toHaveBeenCalledOnce();
    vi.spyOn(fixture.attempts, 'read').mockRejectedValueOnce(
      new RecoveryFault('RECOVERY_UNAVAILABLE')
    );
    expect((await checkedReconcile()).status).toBe(503);
    expect(fixture.reportToken).not.toHaveBeenCalled();
  });
  it.each(['true', '0', '1,1'])(
    'rejects a malformed proof selector %s before touching the attempt',
    async (value) => {
      expect((await fixture.get({ [RECOVERY_TERMINAL_HEADER]: value })).status).toBe(400);
      expect(fixture.storage.operations).toEqual([]);
    }
  );
  it('excludes capability and ACK from checked terminal negotiation', async () => {
    const capability = new Request(`https://splotch.test${RECOVERY_PATH}`, {
      headers: {
        ...checkedHeaders,
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
      },
    });
    expect((await fixture.invoke(capability)).status).toBe(400);
    const ack = new Request(`https://splotch.test${RECOVERY_PATH}`, {
      method: 'POST',
      headers: {
        ...checkedHeaders,
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
        [INSTALLATION_ID_HEADER]: fixture.credential.identity,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'ack',
        id: fixture.identity.id,
        createdAt: fixture.identity.createdAt,
        digest: 'a'.repeat(64),
        receipt: 'b'.repeat(64),
      }),
    });
    expect((await fixture.invoke(ack)).status).toBe(400);
    expect(fixture.storage.operations).toEqual([]);
    expect(fixture.authorize).not.toHaveBeenCalled();
  });
  it('cannot open the production service latch with the terminal header', async () => {
    const handlers = createRecoveryAttemptHandlers({
      ...fixture.dependencies,
      enabled: () => recoveryServiceEnabled('true'),
    });
    const request = new Request(`https://splotch.test${RECOVERY_PATH}`, {
      headers: {
        ...checkedHeaders,
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
      },
    });
    const response = await handlers.GET({
      request,
      url: new URL(request.url),
      getClientAddress: () => '192.0.2.1',
    });
    expect(response.status).toBe(503);
    expect(fixture.storage.operations).toEqual([]);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
});
