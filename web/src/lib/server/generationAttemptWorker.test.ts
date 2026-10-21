// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));
vi.mock('$lib/server/runtimeMode', () => ({ dev: true }));
vi.mock('./sleep', () => ({ sleep: vi.fn(async () => {}) }));
import {
  recoveryServiceFixture,
  SERVICE_TEST_TIME,
  SERVICE_TEST_SECRET,
  type RecoveryServiceFixture,
} from './generationAttemptServiceTestHarness';
import { createRecoveryWorker } from './generationAttemptWorker';
import {
  RECOVERY_WORK_MAX_BYTES,
  RECOVERY_WORK_TICKET_AGE_MS,
  RECOVERY_WORKER_PATH,
  RECOVERY_WORK_TICKET_HEADER,
} from './generationAttemptPolicy';
import { openRecoveryWork, sealRecoveryWork, signRecoveryWork } from './generationAttemptWork';
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
describe('signed permanent-claim worker', () => {
  it('concurrent signed delivery invokes the fixture provider only once', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const responses = await Promise.all([
      fixture.worker(fixture.workRequest(pending)),
      fixture.worker(fixture.workRequest(pending)),
    ]);
    expect(responses.map((reply) => reply.status)).toEqual([200, 200]);
    expect(fixture.provider.generateImage).toHaveBeenCalledTimes(1);
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('image');
  });
  it('confirms a committed claim whose write reply is lost without authorizing another provider', async () => {
    await fixture.raw();
    fixture.storage.nextWriteFaults.set(`${fixture.identity.id}/record`, 'after');
    await fixture.runWorker();
    await fixture.runWorker();
    expect(fixture.provider.generateImage).toHaveBeenCalledTimes(1);
  });
  it('an uncommitted permanent claim never reaches the provider', async () => {
    await fixture.raw();
    fixture.storage.nextWriteFaults.set(`${fixture.identity.id}/record`, 'before');
    expect((await fixture.runWorker()).status).toBe(200);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('a permanently claimed unknown outcome never permits provider takeover', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    vi.mocked(fixture.provider.generateImage).mockImplementation(async () => {
      fixture.storage.readFailures.add(`${fixture.identity.id}/record`);
      return { kind: 'image', data: 'BQYHCA==', mimeType: 'image/png' };
    });
    await fixture.worker(fixture.workRequest(pending));
    fixture.storage.readFailures.clear();
    fixture.dispatch.mockClear();
    await fixture.reconcile();
    await fixture.worker(fixture.workRequest(pending));
    expect(fixture.provider.generateImage).toHaveBeenCalledTimes(1);
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('working');
  });
  it('retries only same-claim raw outcome persistence after an uncommitted outcome write', async () => {
    await fixture.raw();
    vi.mocked(fixture.provider.generateImage).mockImplementation(async () => {
      fixture.storage.nextWriteFaults.set(`${fixture.identity.id}/record`, 'before');
      return { kind: 'image', data: 'BQYHCA==', mimeType: 'image/png' };
    });
    expect((await fixture.runWorker()).status).toBe(200);
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('image');
    expect(fixture.provider.generateImage).toHaveBeenCalledTimes(1);
  });
  it('provider throws become a bounded recorded error and an honest terminal worker response', async () => {
    await fixture.raw();
    vi.mocked(fixture.provider.generateImage).mockRejectedValue(new Error('fixture timeout'));
    expect((await fixture.runWorker()).status).toBe(200);
    await fixture.runWorker();
    expect(fixture.provider.generateImage).toHaveBeenCalledTimes(1);
    expect(await fixture.attempts.read(fixture.lookup)).toMatchObject({
      phase: 'error',
      reason: 'That creation could not be completed',
    });
  });
  it('a mismatched signed fingerprint is rejected before permanent claim', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    expect(
      (await fixture.worker(fixture.workRequest(pending, { requestFingerprint: 'e'.repeat(64) })))
        .status
    ).toBe(200);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('a signed envelope for another credential cannot claim the original admission', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    await fixture.worker(
      fixture.workRequest(pending, { credential: { kind: 'free', identity: 'c'.repeat(64) } })
    );
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('rejects an old domain or stale work time before claim', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const old = fixture.workRequest(pending);
    const value = JSON.parse(await old.text());
    value.domain = 'splotch-legacy-worker';
    const raw = JSON.stringify(value);
    const response = await fixture.worker(
      new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [RECOVERY_WORK_TICKET_HEADER]: signRecoveryWork(raw, SERVICE_TEST_SECRET) ?? '',
        },
        body: raw,
      })
    );
    expect(response.status).toBe(400);
    expect(
      (
        await fixture.worker(
          fixture.workRequest(pending, {
            issuedAt: SERVICE_TEST_TIME - RECOVERY_WORK_TICKET_AGE_MS - 1,
          })
        )
      ).status
    ).toBe(400);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
  it('rejects unsigned, tampered, unknown-field and oversized work before storage access', async () => {
    const oversized = new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(RECOVERY_WORK_MAX_BYTES + 1),
    });
    expect((await fixture.worker(oversized)).status).toBe(413);
    expect(
      (
        await fixture.worker(
          new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
        )
      ).status
    ).toBe(403);
    expect(fixture.storage.operations).toEqual([]);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
  it('rejects an authenticated unknown work field before the permanent claim', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const original = fixture.workRequest(pending);
    const value = JSON.parse(await original.text());
    value.retryProvider = true;
    const body = JSON.stringify(value);
    const response = await fixture.worker(
      new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [RECOVERY_WORK_TICKET_HEADER]: signRecoveryWork(body, SERVICE_TEST_SECRET) ?? '',
        },
        body,
      })
    );
    expect(response.status).toBe(400);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('rejects a body changed after its ticket was issued', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const original = fixture.workRequest(pending);
    const raw = await original.text();
    const response = await fixture.worker(
      new Request(original.url, {
        method: 'POST',
        headers: original.headers,
        body: raw.replace(pending.admission.input.requestFingerprint, 'e'.repeat(64)),
      })
    );
    expect(response.status).toBe(403);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('rejects re-signed ciphertext tampering and a wrong encryption key before any permanent claim', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const original = await fixture.workRequest(pending).text();
    const value = JSON.parse(original);
    value.credential.sealed.tag = 'A'.repeat(22);
    const wrongKey = sealRecoveryWork(
      openRecoveryWork(original, SERVICE_TEST_SECRET, SERVICE_TEST_TIME),
      'other-fixture-secret'
    );
    for (const body of [JSON.stringify(value), wrongKey]) {
      const response = await fixture.worker(
        new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [RECOVERY_WORK_TICKET_HEADER]: signRecoveryWork(body, SERVICE_TEST_SECRET) ?? '',
          },
          body,
        })
      );
      expect(response.status).toBe(400);
      expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
    }
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
  it('absent signing secret and absent hosted project key fail closed before claim', async () => {
    await fixture.raw();
    const pending = await fixture.attempts.read(fixture.lookup);
    const common = {
      enabled: () => true,
      usageSecret: () => undefined,
      attempts: () => fixture.attempts,
      provider: fixture.provider,
      now: Date.now,
    };
    const unsigned = createRecoveryWorker({
      ...common,
      secret: () => undefined,
      projectKey: () => 'fixture-provider-key',
    });
    expect((await unsigned(fixture.workRequest(pending))).status).toBe(403);
    const unconfigured = createRecoveryWorker({
      ...common,
      secret: () => SERVICE_TEST_SECRET,
      projectKey: () => undefined,
    });
    expect((await unconfigured(fixture.workRequest(pending))).status).toBe(200);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('pending');
  });
  it('an unfunded preparing admission cannot authorize a provider even with a valid signed ticket', async () => {
    getStoreMock.mockImplementationOnce(() => {
      throw new Error('Fixture ledger unavailable');
    });
    expect((await fixture.raw()).status).toBe(503);
    const preparing = await fixture.attempts.read(fixture.lookup);
    expect(preparing.phase).toBe('preparing');
    expect((await fixture.worker(fixture.workRequest(preparing))).status).toBe(200);
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
    expect((await fixture.attempts.read(fixture.lookup)).phase).toBe('preparing');
  });
  it('an already permanently claimed admission gives no provider authority', async () => {
    const first = await fixture.raw();
    expect(first.status).toBe(202);
    const claim = await fixture.attempts.claim(fixture.identity.id);
    expect(claim).not.toBeNull();
    await fixture.runWorker();
    expect(fixture.provider.generateImage).not.toHaveBeenCalled();
  });
});
describe('managed usage remains best-effort metrics', () => {
  it('only the winning worker claim invokes the shared managed tally, never collection or reconcile', async () => {
    const managed = recoveryServiceFixture({ kind: 'managed', identity: 'fixture-managed-code' });
    getStoreMock.mockReturnValue(managed.ledger.store());
    await managed.raw();
    const pending = await managed.attempts.read(managed.lookup);
    await Promise.all([
      managed.worker(managed.workRequest(pending)),
      managed.worker(managed.workRequest(pending)),
    ]);
    const usageRecords = () =>
      [...managed.ledger.entries.entries()].filter(([key]) => key.startsWith('grant-v1/'));
    expect(usageRecords()).toHaveLength(1);
    expect(usageRecords()[0][1].data).toMatchObject({ count: 1, lastOutcome: 'succeeded' });
    await managed.get();
    await managed.reconcile();
    await managed.get();
    await managed.reconcile();
    expect(usageRecords()[0][1].data).toMatchObject({ count: 1 });
    expect(managed.provider.generateImage).toHaveBeenCalledTimes(1);
  });
});
