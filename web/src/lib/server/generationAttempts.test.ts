// @vitest-environment node
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  RECOVERY_TTL_MS,
  RECOVERY_ADMISSION_AGE_MS,
  RECOVERY_FUTURE_SKEW_MS,
} from '../ai/generationAttempt';
import {
  attemptDigest,
  attemptRequestFingerprint,
  deriveAttemptId,
  RECOVERY_PROVISIONAL_TOMBSTONE_MS,
} from './generationAttempts';
import { attemptKey } from './generationAttemptPersistence';
import { attemptBlobMetadata } from './generationAttemptStorage';
import { encodeAttemptRecord, type AttemptRecord } from './generationAttemptRecord';
import { sweepGenerationAttempts } from './generationAttemptSweep';
import {
  attemptFixture,
  pendingFixture,
  imageFixture,
  deliveryFixture,
  forkAttemptApi,
  ATTEMPT_TEST_TIME_MS,
  ATTEMPT_TEST_INPUT,
  ATTEMPT_TEST_OUTPUT,
  ATTEMPT_TEST_FUNDING,
} from './generationAttemptsTestHarness';

function fault(code: string) {
  return { code };
}
describe('generation recovery admission', () => {
  it('derives the capability from the protocol, exact nonce and integer time', () => {
    const f = attemptFixture();
    expect(f.lookup.id).toBe(
      attemptDigest(
        JSON.stringify(['splotch-ai-recovery-v1', f.request.identity.nonce, ATTEMPT_TEST_TIME_MS])
      )
    );
    expect(() =>
      deriveAttemptId(f.request.identity.nonce.toUpperCase(), ATTEMPT_TEST_TIME_MS)
    ).toThrow();
    expect(() => deriveAttemptId(f.request.identity.nonce, 0.5)).toThrow();
  });
  it('pins the first server time and expiry across duplicate admission', async () => {
    const f = attemptFixture();
    const first = await f.api.admit(f.request, ATTEMPT_TEST_INPUT);
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_ADMISSION_AGE_MS + 1);
    expect(await f.api.admit(f.request, ATTEMPT_TEST_INPUT)).toEqual(first);
    expect(first.admission.admittedAt).toBe(ATTEMPT_TEST_TIME_MS);
    expect(first.admission.expiresAt).toBe(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS);
  });
  it.each([-RECOVERY_ADMISSION_AGE_MS - 1, RECOVERY_FUTURE_SKEW_MS + 1])(
    'refuses a fresh admission outside the time window by %s milliseconds',
    async (offset) => {
      const f = attemptFixture();
      const identity = { ...f.request.identity, createdAt: ATTEMPT_TEST_TIME_MS + offset };
      identity.id = deriveAttemptId(identity.nonce, identity.createdAt);
      await expect(
        f.api.admit({ ...f.request, identity }, ATTEMPT_TEST_INPUT)
      ).rejects.toMatchObject(fault('RECOVERY_INVALID'));
      expect(f.storage.entries.size).toBe(0);
    }
  );
  it.each([-RECOVERY_ADMISSION_AGE_MS, RECOVERY_FUTURE_SKEW_MS])(
    'accepts a time-window boundary at %s milliseconds',
    async (offset) => {
      const f = attemptFixture();
      const identity = { ...f.request.identity, createdAt: ATTEMPT_TEST_TIME_MS + offset };
      identity.id = deriveAttemptId(identity.nonce, identity.createdAt);
      expect((await f.api.admit({ ...f.request, identity }, ATTEMPT_TEST_INPUT)).phase).toBe(
        'preparing'
      );
    }
  );
  it('admits concurrent identical requests with one immutable record and exact input', async () => {
    const f = attemptFixture();
    const replies = await Promise.all([
      f.api.admit(f.request, ATTEMPT_TEST_INPUT),
      f.api.admit(f.request, ATTEMPT_TEST_INPUT),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect(f.storage.entries.size).toBe(2);
    expect(f.storage.entries.get(attemptKey(f.lookup.id, 'input'))?.bytes).toEqual(
      ATTEMPT_TEST_INPUT
    );
  });
  it.each([
    'style',
    'mime',
    'promptPolicyRevision',
    'prompt',
    'inputDigest',
    'requestFingerprint',
  ] as const)('rejects changed %s under an admitted id', async (field) => {
    const f = attemptFixture();
    await f.api.admit(f.request, ATTEMPT_TEST_INPUT);
    const variants = {
      style: 'Clay',
      mime: 'image/jpeg',
      promptPolicyRevision: 'test-policy-v2',
      prompt: 'A changed prompt.',
      inputDigest: 'c'.repeat(64),
      requestFingerprint: 'e'.repeat(64),
    };
    const input = { ...f.request.input, [field]: variants[field] };
    const bytes = field === 'inputDigest' ? new Uint8Array([9, 9, 9, 9]) : ATTEMPT_TEST_INPUT;
    if (field === 'inputDigest') input.inputDigest = attemptDigest(bytes);
    if (field !== 'requestFingerprint') input.requestFingerprint = attemptRequestFingerprint(input);
    await expect(f.api.admit({ ...f.request, input }, bytes)).rejects.toMatchObject(
      fault('RECOVERY_CONFLICT')
    );
  });
  it('rejects a different credential binding without leaking an existing record', async () => {
    const f = attemptFixture();
    await f.api.admit(f.request, ATTEMPT_TEST_INPUT);
    await expect(
      f.api.admit({ ...f.request, credentialBinding: 'c'.repeat(64) }, ATTEMPT_TEST_INPUT)
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
    await expect(
      f.api.read({ ...f.lookup, credentialBinding: 'c'.repeat(64) })
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
  });
  it('rejects empty or mismatched input bytes before writing', async () => {
    const f = attemptFixture();
    await expect(f.api.admit(f.request, new Uint8Array())).rejects.toMatchObject(
      fault('RECOVERY_INVALID')
    );
    await expect(f.api.admit(f.request, ATTEMPT_TEST_OUTPUT)).rejects.toMatchObject(
      fault('RECOVERY_INVALID')
    );
    expect(f.storage.entries.size).toBe(0);
  });
  it('resolves a lost admission reply by exact state reread', async () => {
    const f = attemptFixture();
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'after');
    expect((await f.api.admit(f.request, ATTEMPT_TEST_INPUT)).phase).toBe('preparing');
    expect(f.storage.entries.size).toBe(2);
  });
  it('keeps an unknown uncommitted admission unavailable without retrying the write', async () => {
    const f = attemptFixture();
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'before');
    await expect(f.api.admit(f.request, ATTEMPT_TEST_INPUT)).rejects.toMatchObject(
      fault('RECOVERY_UNAVAILABLE')
    );
    expect(
      f.storage.operations.filter((entry) => entry === `write:${attemptKey(f.lookup.id, 'record')}`)
    ).toHaveLength(1);
  });
  it('fails closed for an existing record with no ETag', async () => {
    const f = await pendingFixture();
    f.storage.missingEtags.add(attemptKey(f.lookup.id, 'record'));
    f.storage.operations.length = 0;
    await expect(f.api.claim(f.lookup.id)).rejects.toMatchObject(fault('RECOVERY_UNAVAILABLE'));
    expect(f.storage.operations.some((entry) => entry.startsWith('write:'))).toBe(false);
  });
  it('does not fund, claim, reconcile, acknowledge or delete on reads', async () => {
    const f = await pendingFixture();
    f.storage.operations.length = 0;
    expect((await f.api.read(f.lookup)).phase).toBe('pending');
    expect(f.storage.operations.every((entry) => entry.startsWith('read:'))).toBe(true);
  });
});
describe('permanent worker ownership', () => {
  it('requires durable funding before pending and rejects a changed funding receipt', async () => {
    const f = attemptFixture();
    await f.api.admit(f.request, ATTEMPT_TEST_INPUT);
    await expect(f.api.markPending(f.lookup)).rejects.toMatchObject(fault('RECOVERY_NOT_READY'));
    await f.api.markFunded(f.lookup, ATTEMPT_TEST_FUNDING);
    await expect(
      f.api.markFunded(f.lookup, { ...ATTEMPT_TEST_FUNDING, receiptDigest: 'd'.repeat(64) })
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
  });
  it('lets only one concurrent worker obtain the exact immutable provider input', async () => {
    const f = await pendingFixture();
    const other = forkAttemptApi(f, '9'.repeat(64));
    const claims = await Promise.all([f.api.claim(f.lookup.id), other.claim(f.lookup.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.bytes).toEqual(ATTEMPT_TEST_INPUT);
    expect(claims.find(Boolean)?.admission.input.prompt).toBe(f.request.input.prompt);
    expect(await f.api.claim(f.lookup.id)).toBeNull();
  });
  it('recovers its own claim after a committed write loses its reply', async () => {
    const f = await pendingFixture();
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'after');
    const claim = await f.api.claim(f.lookup.id);
    expect(claim?.claimId).toMatch(/^[a-f0-9]{64}$/);
    expect((await f.api.read(f.lookup)).phase).toBe('working');
  });
  it('never takes over a crashed worker claim', async () => {
    const f = await pendingFixture();
    await f.api.claim(f.lookup.id);
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS - 1);
    expect(await f.api.claim(f.lookup.id)).toBeNull();
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS);
    await expect(f.api.claim(f.lookup.id)).rejects.toMatchObject(fault('RECOVERY_EXPIRED'));
  });
  it('does not expose input when its digest is corrupted or CAS is rejected', async () => {
    const f = await pendingFixture();
    const key = attemptKey(f.lookup.id, 'input');
    const entry = f.storage.entries.get(key);
    if (!entry) throw new Error('fixture input absent');
    entry.bytes[0] ^= 1;
    await expect(f.api.claim(f.lookup.id)).rejects.toMatchObject(fault('RECOVERY_UNAVAILABLE'));
    const fresh = await pendingFixture();
    fresh.storage.forceCasLoss.add(attemptKey(fresh.lookup.id, 'record'));
    expect(await fresh.api.claim(fresh.lookup.id)).toBeNull();
  });
  it('rejects outcomes from an unclaimed or different worker', async () => {
    const f = await pendingFixture();
    await expect(
      f.api.complete(f.lookup.id, 'c'.repeat(64), { phase: 'error', reason: 'failure' }, null)
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
    await f.api.claim(f.lookup.id);
    await expect(
      f.api.complete(f.lookup.id, 'c'.repeat(64), { phase: 'error', reason: 'failure' }, null)
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
  });
  it('keeps an immutable raw image and rejects a changed worker outcome', async () => {
    const f = await imageFixture();
    expect(await f.api.readRawImage(f.lookup)).toEqual(ATTEMPT_TEST_OUTPUT);
    expect(
      (await f.api.complete(f.lookup.id, f.claimed.claimId, f.outcome, ATTEMPT_TEST_OUTPUT)).phase
    ).toBe('image');
    await expect(
      f.api.complete(f.lookup.id, f.claimed.claimId, { phase: 'error', reason: 'changed' }, null)
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
  });
  it.each(['refusal', 'error'] as const)(
    'records an immutable %s outcome without bytes',
    async (phase) => {
      const f = await pendingFixture();
      const claim = await f.api.claim(f.lookup.id);
      if (!claim) throw new Error('fixture claim absent');
      expect(
        (
          await f.api.complete(
            f.lookup.id,
            claim.claimId,
            { phase, reason: 'safe bounded reason' },
            null
          )
        ).phase
      ).toBe(phase);
      expect(await f.api.claim(f.lookup.id)).toBeNull();
    }
  );
});
describe('immutable delivery and durable acknowledgement', () => {
  it('requires exact raw outcome and settlement receipt binding before staging', async () => {
    const f = await deliveryFixture();
    await expect(
      f.api.stageDelivery(
        f.lookup,
        { ...f.proposal, settlementReceiptDigest: 'e'.repeat(64) },
        ATTEMPT_TEST_OUTPUT
      )
    ).rejects.toMatchObject(fault('RECOVERY_CONFLICT'));
    expect((await f.api.stageDelivery(f.lookup, f.proposal, ATTEMPT_TEST_OUTPUT)).phase).toBe(
      'delivery'
    );
  });
  it('returns identical bytes and receipt across repeated nondestructive collection', async () => {
    const f = await deliveryFixture();
    f.storage.operations.length = 0;
    expect(await f.api.readDelivery(f.lookup)).toEqual(f.collected);
    expect(await f.api.readDelivery(f.lookup)).toEqual(f.collected);
    expect(f.storage.operations.every((entry) => entry.startsWith('read:'))).toBe(true);
  });
  it('persists the exact ACK tombstone before trying byte deletion', async () => {
    const f = await deliveryFixture();
    const { image, receipt } = f.collected.delivery;
    f.storage.operations.length = 0;
    f.storage.deleteFailures.add(attemptKey(f.lookup.id, 'delivery'));
    const result = await f.api.acknowledge(f.lookup, image.digest, receipt);
    expect(result.phase).toBe('acknowledged');
    expect((await f.api.read(f.lookup)).phase).toBe('acknowledged');
    expect(f.storage.operations.indexOf(`write:${attemptKey(f.lookup.id, 'record')}`)).toBeLessThan(
      f.storage.operations.indexOf(`delete:${attemptKey(f.lookup.id, 'input')}`)
    );
    expect(await f.api.acknowledge(f.lookup, image.digest, receipt)).toEqual(result);
  });
  it('recovers a lost ACK reply without regenerating a receipt or retrying funding', async () => {
    const f = await deliveryFixture();
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'after');
    const { image, receipt } = f.collected.delivery;
    const first = await f.api.acknowledge(f.lookup, image.digest, receipt);
    f.setTime(ATTEMPT_TEST_TIME_MS + 1);
    expect(await f.api.acknowledge(f.lookup, image.digest, receipt)).toEqual(first);
  });
  it('makes concurrent identical ACKs stable', async () => {
    const f = await deliveryFixture();
    const { image, receipt } = f.collected.delivery;
    const replies = await Promise.all([
      f.api.acknowledge(f.lookup, image.digest, receipt),
      f.api.acknowledge(f.lookup, image.digest, receipt),
    ]);
    expect(replies[0]).toEqual(replies[1]);
  });
  it('does not delete bytes after an unconfirmed ACK write', async () => {
    const f = await deliveryFixture();
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'before');
    f.storage.operations.length = 0;
    await expect(
      f.api.acknowledge(f.lookup, f.collected.delivery.image.digest, f.collected.delivery.receipt)
    ).rejects.toMatchObject(fault('RECOVERY_UNAVAILABLE'));
    expect(f.storage.operations.some((entry) => entry.startsWith('delete:'))).toBe(false);
    expect((await f.api.read(f.lookup)).phase).toBe('delivery');
  });
  it('rejects changed ACK digest or receipt before and after acknowledgement', async () => {
    const f = await deliveryFixture();
    const { image, receipt } = f.collected.delivery;
    await expect(f.api.acknowledge(f.lookup, '0'.repeat(64), receipt)).rejects.toMatchObject(
      fault('RECOVERY_CONFLICT')
    );
    await f.api.acknowledge(f.lookup, image.digest, receipt);
    await expect(f.api.acknowledge(f.lookup, image.digest, '0'.repeat(64))).rejects.toMatchObject(
      fault('RECOVERY_CONFLICT')
    );
  });
  it('ends retrieval at original expiry while retaining explicit ACK recovery until the provisional horizon', async () => {
    const f = await deliveryFixture();
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS);
    await expect(f.api.readDelivery(f.lookup)).rejects.toMatchObject(fault('RECOVERY_EXPIRED'));
    expect(
      (
        await f.api.acknowledge(
          f.lookup,
          f.collected.delivery.image.digest,
          f.collected.delivery.receipt
        )
      ).phase
    ).toBe('acknowledged');
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS + RECOVERY_PROVISIONAL_TOMBSTONE_MS);
    await expect(
      f.api.acknowledge(f.lookup, f.collected.delivery.image.digest, f.collected.delivery.receipt)
    ).rejects.toMatchObject(fault('RECOVERY_EXPIRED'));
  });
});
describe('expiry sweep and orphan correctness', () => {
  it('retains live input then deletes expired bytes while preserving the original identity tombstone horizon', async () => {
    const f = await imageFixture();
    expect((await sweepGenerationAttempts(f.storage, ATTEMPT_TEST_TIME_MS)).deleted).toBe(0);
    expect(
      (await sweepGenerationAttempts(f.storage, ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS)).deleted
    ).toBe(1);
    expect(f.storage.entries.has(attemptKey(f.lookup.id, 'record'))).toBe(true);
    await sweepGenerationAttempts(
      f.storage,
      ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS + RECOVERY_PROVISIONAL_TOMBSTONE_MS
    );
    expect(f.storage.entries.size).toBe(0);
  });
  it('sweeps expired orphan bytes and retains a fresh orphan without guessing absence authorizes deletion', async () => {
    const f = attemptFixture();
    const key = attemptKey(f.lookup.id, 'raw');
    f.storage.replace(
      key,
      ATTEMPT_TEST_OUTPUT,
      attemptBlobMetadata(f.lookup.id, ATTEMPT_TEST_TIME_MS, ATTEMPT_TEST_OUTPUT)
    );
    expect((await sweepGenerationAttempts(f.storage, ATTEMPT_TEST_TIME_MS - 1)).retained).toBe(1);
    expect((await sweepGenerationAttempts(f.storage, ATTEMPT_TEST_TIME_MS)).deleted).toBe(1);
  });
  it('retains status when cleanup fails and never treats unavailable reads as expired', async () => {
    const f = await imageFixture();
    f.storage.deleteFailures.add(attemptKey(f.lookup.id, 'raw'));
    await sweepGenerationAttempts(
      f.storage,
      ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS + RECOVERY_PROVISIONAL_TOMBSTONE_MS
    );
    expect(f.storage.entries.has(attemptKey(f.lookup.id, 'record'))).toBe(true);
    f.storage.readFailures.add(attemptKey(f.lookup.id, 'record'));
    expect(
      (await sweepGenerationAttempts(f.storage, ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS)).unavailable
    ).toBeGreaterThan(0);
  });
  it('rejects malformed strict-phase records rather than dropping unknown fields or resetting funding', async () => {
    const f = await pendingFixture();
    const record = await f.api.read(f.lookup);
    const bytes = new TextEncoder().encode(JSON.stringify({ ...record, claimId: 'c'.repeat(64) }));
    f.storage.replace(
      attemptKey(f.lookup.id, 'record'),
      bytes,
      attemptBlobMetadata(f.lookup.id, record.admission.expiresAt, bytes)
    );
    await expect(f.api.read(f.lookup)).rejects.toMatchObject(fault('RECOVERY_UNAVAILABLE'));
    expect(encodeAttemptRecord(record).byteLength).toBeGreaterThan(0);
  });
});

describe('store faults and interrupted lifecycle', () => {
  it('distinguishes absent attempts from an unavailable store', async () => {
    const f = attemptFixture();
    await expect(f.api.read(f.lookup)).rejects.toMatchObject(fault('RECOVERY_ABSENT'));
    f.storage.readFailures.add(attemptKey(f.lookup.id, 'record'));
    await expect(f.api.read(f.lookup)).rejects.toMatchObject(fault('RECOVERY_UNAVAILABLE'));
  });
  it('preserves claim ownership when best-effort input deletion fails', async () => {
    const f = await pendingFixture();
    f.storage.deleteFailures.add(attemptKey(f.lookup.id, 'input'));
    const claimed = await f.api.claim(f.lookup.id);
    expect(claimed?.bytes).toEqual(ATTEMPT_TEST_INPUT);
    expect(f.storage.entries.has(attemptKey(f.lookup.id, 'input'))).toBe(true);
    expect(await f.api.claim(f.lookup.id)).toBeNull();
  });
  it('confirms raw output publication and outcome CAS after separate lost replies', async () => {
    const f = await pendingFixture();
    const claimed = await f.api.claim(f.lookup.id);
    if (!claimed) throw new Error('fixture claim absent');
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'raw'), 'after');
    f.storage.nextWriteFaults.set(attemptKey(f.lookup.id, 'record'), 'after');
    const outcome = {
      phase: 'image',
      image: {
        digest: attemptDigest(ATTEMPT_TEST_OUTPUT),
        byteLength: ATTEMPT_TEST_OUTPUT.byteLength,
        mime: 'image/png',
      },
    } as const;
    expect(
      (await f.api.complete(f.lookup.id, claimed.claimId, outcome, ATTEMPT_TEST_OUTPUT)).phase
    ).toBe('image');
    expect(await f.api.readRawImage(f.lookup)).toEqual(ATTEMPT_TEST_OUTPUT);
    await expect(
      f.api.complete(f.lookup.id, claimed.claimId, outcome, ATTEMPT_TEST_INPUT)
    ).rejects.toMatchObject(fault('RECOVERY_INVALID'));
  });
  it('refuses a stale worker finish without extending retrieval expiry', async () => {
    const f = await pendingFixture();
    const claimed = await f.api.claim(f.lookup.id);
    if (!claimed) throw new Error('fixture claim absent');
    f.setTime(ATTEMPT_TEST_TIME_MS + RECOVERY_TTL_MS);
    await expect(
      f.api.complete(f.lookup.id, claimed.claimId, { phase: 'error', reason: 'late' }, null)
    ).rejects.toMatchObject(fault('RECOVERY_EXPIRED'));
    expect(f.storage.entries.has(attemptKey(f.lookup.id, 'raw'))).toBe(false);
  });
});

describe('phase type contracts', () => {
  it('gives each phase exactly the fields its operation owns', () => {
    expectTypeOf<keyof Extract<AttemptRecord, { phase: 'preparing' }>>().toEqualTypeOf<
      'phase' | 'admission'
    >();
    expectTypeOf<keyof Extract<AttemptRecord, { phase: 'working' }>>().toEqualTypeOf<
      'phase' | 'admission' | 'funding' | 'claimId'
    >();
    expectTypeOf<keyof Extract<AttemptRecord, { phase: 'delivery' }>>().toEqualTypeOf<
      'phase' | 'admission' | 'funding' | 'delivery'
    >();
    expectTypeOf<keyof Extract<AttemptRecord, { phase: 'acknowledged' }>>().toEqualTypeOf<
      'phase' | 'admission' | 'digest' | 'receipt' | 'acknowledgedAt' | 'retainUntil'
    >();
  });
});
