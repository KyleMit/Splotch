// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));
import { API_KEY_HEADER, INSTALLATION_ID_HEADER, REPORT_TOKEN_HEADER } from '../apiHeaders';
import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_TTL_MS,
  RECOVERY_MAX_INPUT_BYTES,
} from '../ai/generationAttempt';
import { ATTEMPT_TEST_OUTPUT } from './generationAttemptsTestHarness';
import { createRecoveryAttemptHandlers } from './generationAttemptService';
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
describe('recovery admission and explicit same-attempt continuation', () => {
  it('concurrent duplicate admissions fund one operation and one daily provider start', async () => {
    const replies = await Promise.all([fixture.raw(), fixture.raw()]);
    expect(replies.map((reply) => reply.status)).toEqual([202, 202]);
    expect(fixture.ledger.grant()).toMatchObject({ attempts: 1, successful: 0 });
    expect(fixture.ledger.entries.get('daily-provider-starts/2026-10-12')?.data).toMatchObject({
      starts: 1,
    });
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('replays a funded duplicate after current authorization becomes unavailable', async () => {
    await fixture.raw();
    fixture.authorize.mockRejectedValue(new Error('Revoked or project key unavailable'));
    expect((await fixture.raw()).status).toBe(202);
    expect(fixture.authorize).toHaveBeenCalledTimes(1);
    expect(fixture.ledger.grant().attempts).toBe(1);
  });
  it('recovers a lost committed grant reply through its original stable operation', async () => {
    fixture.ledger.backend.dropAcknowledgementFor = fixture.credential.identity;
    expect((await fixture.raw()).status).toBe(202);
    expect((await fixture.reconcile()).status).toBe(202);
    expect(fixture.ledger.grant().attempts).toBe(1);
  });
  it('re-dispatches unknown pending handoff only from an explicit POST', async () => {
    await fixture.raw();
    fixture.dispatch.mockClear();
    await fixture.get();
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect((await fixture.reconcile()).status).toBe(202);
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
  it('does not renew original admission time or expiry on duplicate replay', async () => {
    await fixture.raw();
    const first = await fixture.attempts.read(fixture.lookup);
    vi.setSystemTime(SERVICE_TEST_TIME + REPLAY_DELAY_MS);
    await fixture.raw();
    const replay = await fixture.attempts.read(fixture.lookup);
    expect(replay.admission).toEqual(first.admission);
  });
  it('does not treat a store read outage as absence or permission to fund', async () => {
    fixture.storage.readFailures.add(`${fixture.identity.id}/record`);
    expect((await fixture.raw()).status).toBe(503);
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.ledger.entries.size).toBe(0);
  });
});
describe('read-only collection and immutable delivery', () => {
  it('GET of a raw image performs no settlement, conversion, dispatch or deletion', async () => {
    await fixture.raw();
    await fixture.runWorker();
    const writes = fixture.storage.operations.filter((op) => !op.startsWith('read:'));
    const ledger = structuredClone([...fixture.ledger.entries]);
    const response = await fixture.get();
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ phase: 'image' });
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.reportToken).not.toHaveBeenCalled();
    expect(fixture.storage.operations.filter((op) => !op.startsWith('read:'))).toEqual(writes);
    expect([...fixture.ledger.entries]).toEqual(ledger);
  });
  it('reconcile publishes one stable delivery and repeated GET returns exact bytes and headers', async () => {
    await fixture.raw();
    await fixture.runWorker();
    const first = await fixture.reconcile();
    const replay = await fixture.get();
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(ATTEMPT_TEST_OUTPUT);
    expect(new Uint8Array(await replay.arrayBuffer())).toEqual(ATTEMPT_TEST_OUTPUT);
    expect([...replay.headers]).toEqual([...first.headers]);
    expect(fixture.ledger.grant().successful).toBe(1);
    expect(fixture.reportToken).toHaveBeenCalledTimes(1);
  });
  it('concurrent staging returns the first immutable delivery even when candidate report tokens differ', async () => {
    await fixture.raw();
    await fixture.runWorker();
    fixture.reportToken
      .mockReturnValueOnce('fixture-first-token')
      .mockReturnValueOnce('fixture-second-token');
    const responses = await Promise.all([fixture.reconcile(), fixture.reconcile()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const tokens = responses.map((response) => response.headers.get(REPORT_TOKEN_HEADER));
    expect(new Set(tokens).size).toBe(1);
    expect(new Uint8Array(await responses[0].arrayBuffer())).toEqual(ATTEMPT_TEST_OUTPUT);
    expect(new Uint8Array(await responses[1].arrayBuffer())).toEqual(ATTEMPT_TEST_OUTPUT);
    expect(fixture.ledger.grant().successful).toBe(1);
  });
  it.each([
    { kind: 'free', identity: 'a'.repeat(64) },
    { kind: 'managed', identity: 'fixture-revoked-code' },
    { kind: 'byok', identity: 'fixture-revoked-key' },
  ] as const)(
    'collects and replays an existing $kind delivery without fresh authorization or key verification',
    async (credential) => {
      const existing = recoveryServiceFixture(credential);
      getStoreMock.mockReturnValue(existing.ledger.store());
      await existing.raw();
      await existing.runWorker();
      await existing.reconcile();
      existing.authorize.mockRejectedValue(new Error('Fixture current authorization unavailable'));
      vi.mocked(existing.provider.verifyKey).mockRejectedValue(
        new Error('Fixture verification must not run')
      );
      expect((await existing.get()).status).toBe(200);
      expect((await existing.raw()).status).toBe(200);
      expect(existing.authorize).toHaveBeenCalledTimes(1);
      expect(existing.provider.verifyKey).not.toHaveBeenCalled();
      expect(existing.provider.generateImage).toHaveBeenCalledTimes(1);
    }
  );
  it('compatible status exposes the original expiry header required by the native parser', async () => {
    const response = await fixture.raw();
    const value = await response.json();
    expect(response.headers.get('X-AI-Recovery-Version')).toBe(RECOVERY_PROTOCOL);
    expect(response.headers.get('X-AI-Attempt-Expires-At')).toBe(String(value.expiresAt));
  });
  it('later reconcile returns an existing delivery without transforming or reminting', async () => {
    await fixture.raw();
    await fixture.runWorker();
    await fixture.reconcile();
    fixture.prepare.mockClear();
    fixture.reportToken.mockClear();
    expect((await fixture.reconcile()).status).toBe(200);
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.reportToken).not.toHaveBeenCalled();
  });
  it('settlement is mandatory and an earlier abandonment prevents a free image delivery', async () => {
    await fixture.raw();
    await fixture.runWorker();
    const settle = vi
      .spyOn(fixture.accounting, 'settle')
      .mockRejectedValue(new Error('abandoned settlement'));
    expect((await fixture.reconcile()).status).toBe(500);
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('image');
    expect(settle).toHaveBeenCalledTimes(1);
    expect(fixture.reportToken).not.toHaveBeenCalled();
  });
  it('a transient raw byte read failure cannot settle a paid image as failed', async () => {
    await fixture.raw();
    await fixture.runWorker();
    fixture.storage.readFailures.add(`${fixture.identity.id}/raw`);
    const settle = vi.spyOn(fixture.accounting, 'settle');
    expect((await fixture.reconcile()).status).toBe(503);
    expect(settle).not.toHaveBeenCalled();
    fixture.storage.readFailures.clear();
    expect((await fixture.reconcile()).status).toBe(200);
  });
  it('refusal is a pure GET status and authenticated POST reconciles its stable failure receipt', async () => {
    vi.mocked(fixture.provider.generateImage).mockResolvedValue({
      kind: 'refusal',
      reason: 'Fixture safety reason',
    });
    await fixture.raw();
    await fixture.runWorker();
    const status = await fixture.get();
    expect(status.status).toBe(202);
    expect(fixture.ledger.grant().failures).toBe(0);
    const response = await fixture.reconcile();
    expect(response.status).toBe(422);
    expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('fixture-bound-report-token');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Drawing was blocked for safety: Fixture safety reason',
    });
    await fixture.reconcile();
    expect(fixture.ledger.grant().failures).toBe(1);
  });
  it('expired GET withholds output and performs no cleanup mutation', async () => {
    await fixture.raw();
    await fixture.runWorker();
    await fixture.reconcile();
    const writes = fixture.storage.operations.filter((op) => !op.startsWith('read:'));
    vi.setSystemTime(SERVICE_TEST_TIME + RECOVERY_TTL_MS);
    expect((await fixture.get()).status).toBe(404);
    expect(fixture.storage.operations.filter((op) => !op.startsWith('read:'))).toEqual(writes);
  });
  it('ACK confirms the exact shared DTO and repeated ACK preserves its receipt', async () => {
    await fixture.raw();
    await fixture.runWorker();
    const image = await fixture.reconcile();
    const body = {
      operation: 'ack',
      id: fixture.identity.id,
      createdAt: fixture.identity.createdAt,
      digest: image.headers.get(RECOVERY_DIGEST_HEADER),
      receipt: image.headers.get(RECOVERY_RECEIPT_HEADER),
    };
    const first = await fixture.mutate(body);
    vi.setSystemTime(SERVICE_TEST_TIME + RECOVERY_TTL_MS + 1);
    const second = await fixture.mutate(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const expected = {
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      id: fixture.identity.id,
      phase: 'acknowledged',
      expiresAt: SERVICE_TEST_TIME + RECOVERY_TTL_MS,
      deliveryDigest: body.digest,
      deliveryReceipt: body.receipt,
    };
    expect(await first.json()).toEqual(expected);
    expect(await second.json()).toEqual(expected);
    expect([...fixture.storage.entries.keys()]).toEqual([`${fixture.identity.id}/record`]);
  });
});
describe('recovery boundary validation', () => {
  it('absent signing configuration closes capability before any state access', async () => {
    const handlers = createRecoveryAttemptHandlers({
      ...fixture.dependencies,
      secret: () => undefined,
    });
    const request = new Request(`https://splotch.test${RECOVERY_PATH}`, {
      headers: { [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL },
    });
    const response = await handlers.GET({
      request,
      url: new URL(request.url),
      getClientAddress: () => '192.0.2.1',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: 'RECOVERY_UNAVAILABLE' });
    expect(fixture.storage.operations).toEqual([]);
  });
  it('rejects credential mutual exclusion before funding', async () => {
    expect((await fixture.raw({ [API_KEY_HEADER]: 'fixture-byok' })).status).toBe(400);
    expect(fixture.ledger.entries.size).toBe(0);
  });
  it.each(['?style=Magical&style=Magical', '?style=unknown', '?style=Magical&token=secret'])(
    'rejects query %s',
    async (query) => {
      expect((await fixture.raw({}, query)).status).toBe(400);
      expect(fixture.authorize).not.toHaveBeenCalled();
    }
  );
  it('rejects conflicting original credential possession without a verification call', async () => {
    await fixture.raw();
    expect((await fixture.get({ [INSTALLATION_ID_HEADER]: 'c'.repeat(64) })).status).toBe(409);
    expect(fixture.provider.verifyKey).not.toHaveBeenCalled();
  });
  it('rejects a declared oversized raw body before decoding or funding', async () => {
    expect(
      (await fixture.raw({ 'Content-Length': String(RECOVERY_MAX_INPUT_BYTES + 1) })).status
    ).toBe(413);
    expect(fixture.dependencies.validateInput).not.toHaveBeenCalled();
    expect(fixture.ledger.entries.size).toBe(0);
  });
  it('rejects noncanonical attempt time and arbitrary JSON fields', async () => {
    expect((await fixture.raw({ [RECOVERY_CREATED_HEADER]: '01' })).status).toBe(400);
    expect(
      (
        await fixture.mutate({
          operation: 'reconcile',
          id: fixture.identity.id,
          createdAt: fixture.identity.createdAt,
          retryProvider: true,
        })
      ).status
    ).toBe(400);
  });
  it('capability has no credential or state access', async () => {
    const response = await fixture.invoke(
      new Request(`https://splotch.test${RECOVERY_PATH}`, {
        headers: { [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL },
      })
    );
    expect(await response.json()).toEqual({
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      jobTtlMs: RECOVERY_TTL_MS,
    });
    expect(fixture.storage.operations).toEqual([]);
    expect(fixture.ledger.entries.size).toBe(0);
  });
});
