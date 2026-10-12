import { afterEach, describe, expect, it } from 'vitest';
import { recoveryDigest } from '../../experiments/native-architecture/src/ai/recoveryDigest.ts';
import { recoveryRequestId } from '../../experiments/native-architecture/src/ai/recoveryRequest.ts';
import {
  fixture,
  block,
  cleanupRecoveryFixtures,
  INPUT,
  OUTPUT,
  DELIVERY_RECEIPT,
} from './native-ai-recovery-controller-harness.mjs';
afterEach(cleanupRecoveryFixtures);

describe('recovery controller source proposals (unrun at packet seal)', () => {
  it('creates a fresh request from exact held bytes and preserves its predecessor', async () => {
    const f = fixture();
    const source = f.latest();
    const before = JSON.stringify(source);
    await f.start('sendRecovery');
    const request = f.latest();
    expect(request.kind).toBe('recovery-request');
    expect(request.journal.id).toBeGreaterThan(source.journal.id);
    expect(request.journal.createdAt).toBeGreaterThan(source.journal.createdAt);
    expect(request.nonce).not.toBe(source.nonce);
    expect(request.recovery.id).toBe(
      await recoveryRequestId(request.nonce, request.journal.createdAt)
    );
    expect(JSON.stringify(f.records.get(source.journal.id))).toBe(before);
    expect(await f.owner.readRecoverySource()).toBe(source);
    expect(f.dispatch.mock.calls[0][1].body).toEqual(INPUT);
    expect(f.storage.markRecoverySubmission).toHaveBeenCalledOnce();
    expect(f.parent.request).toHaveBeenCalledWith('ai', expect.any(Function));
    await f.start('sendRecovery');
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('saves held intent without any generation upload', async () => {
    const f = fixture({ source: null });
    await f.start('prepareRecovery');
    expect(f.latest().recovery.intent).toBe('committed');
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it.each(['close', 'background', 'consent', 'dispose', 'vault-write', 'vault-remove'])(
    'revokes later dispatch after a delayed upload read and %s',
    async (kind) => {
      const f = fixture();
      const delayed = block(f.storage.readRecoveryUpload);
      await f.owner.sendRecovery();
      await delayed.started;
      f.revoke(kind);
      delayed.release();
      await f.idle();
      expect(f.dispatch).not.toHaveBeenCalled();
      expect(f.latest().recovery.state).toBe('submission-uncertain');
    }
  );
  it.each([
    'readRecoveryAttempt',
    'pin',
    'readReferenced',
    'prepareRecoverySendFromHeld',
    'markRecoverySubmission',
  ])('rechecks permission after awaited %s', async (name) => {
    const f = fixture();
    const method = f.storage[name] ?? f.rawVault[name];
    const delayed = block(method);
    await f.owner.sendRecovery();
    await delayed.started;
    f.owner.close();
    delayed.release();
    await f.idle();
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('rereads a committed submission whose callback is lost without repeating raw POST', async () => {
    const f = fixture();
    const original = f.storage.markRecoverySubmission.getMockImplementation();
    f.storage.markRecoverySubmission.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('callback lost');
    });
    await f.start('sendRecovery');
    expect(f.storage.read).toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    await f.start('sendRecovery');
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('collects, pins, confirms and ACKs only the exact same request', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const id = f.latest().recovery.id;
    f.dispatch.mockClear();
    await f.start('collectRecovery');
    expect(f.latest().recovery.state).toBe('acknowledged');
    expect(
      f.dispatch.mock.calls.map(([, request]) => [request.method, request.recovery.id])
    ).toEqual([
      ['GET', id],
      ['POST', id],
    ]);
    expect(f.storage.readRecoveryAttempt).toHaveBeenCalled();
    expect(f.admit).toHaveBeenCalledWith(OUTPUT, 'image/png');
    expect(f.storage.recordAck).toHaveBeenCalledOnce();
  });
  it.each(['admit', 'retainRecoveryResult', 'readRecoveryAttempt'])(
    'does not ACK after collection is revoked at %s',
    async (name) => {
      const f = fixture();
      await f.start('sendRecovery');
      f.dispatch.mockClear();
      const method = name === 'admit' ? f.admit : f.storage[name];
      if (name === 'readRecoveryAttempt') {
        const original = method.getMockImplementation();
        let count = 0;
        method.mockImplementation(async (...args) => {
          const result = await original(...args);
          count += 1;
          if (count === 2) f.owner.close();
          return result;
        });
        await f.start('collectRecovery');
      } else {
        const delayed = block(method);
        await f.owner.collectRecovery();
        await delayed.started;
        f.owner.close();
        delayed.release();
        await f.idle();
      }
      expect(f.dispatch.mock.calls.map(([, request]) => request.method)).toEqual(['GET']);
      expect(f.storage.recordAck).not.toHaveBeenCalled();
    }
  );
  it('preserves a committed retained result after revocation and retries exact ACK with fresh approval', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const delayed = block(f.storage.retainRecoveryResult);
    await f.owner.collectRecovery();
    await delayed.started;
    f.owner.close();
    delayed.release();
    await f.idle();
    const retained = f.latest();
    expect(retained.recovery.state).toBe('retained');
    expect(f.owner.getState().recovery).toBe(retained);
    f.owner.show(retained);
    f.dispatch.mockClear();
    f.parent.request.mockClear();
    await f.start('acknowledgeRecovery');
    expect(f.parent.request).toHaveBeenCalledOnce();
    expect(f.dispatch).toHaveBeenCalledOnce();
    const request = f.dispatch.mock.calls[0][1];
    expect(request.recovery.kind).toBe('ack');
    expect(JSON.parse(request.body)).toEqual({
      operation: 'ack',
      id: retained.recovery.id,
      createdAt: retained.journal.createdAt,
      digest: retained.recovery.delivery.digest,
      receipt: DELIVERY_RECEIPT,
    });
  });
  it('reconciles the existing request without changing identity or making another raw POST', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const before = f.latest();
    f.dispatch.mockClear();
    await f.start('reconcileRecovery');
    expect(f.dispatch.mock.calls[0][1].body).toBe(
      JSON.stringify({
        operation: 'reconcile',
        id: before.recovery.id,
        createdAt: before.journal.createdAt,
      })
    );
    expect(f.latest().nonce).toBe(before.nonce);
    expect(f.storage.readRecoveryUpload).toHaveBeenCalledOnce();
  });
  it.each(['refusal', 'error'])(
    'preserves the original and stops a checked terminal %s attempt',
    async (phase) => {
      const f = fixture();
      const original = f.latest();
      await f.start('sendRecovery');
      const before = f.latest();
      f.dispatch.mockImplementationOnce(async () => ({
        kind: 'recovery',
        reply: {
          kind: 'status',
          phase,
          id: before.recovery.id,
          expiresAt: before.recovery.expiry.expiresAt,
          pollAfterMs: 4000,
        },
      }));
      await f.start('collectRecovery');
      expect(f.latest().recovery.state).toBe('terminal');
      expect(f.latest().recovery.outcome).toBe(phase);
      expect(await f.owner.readRecoverySource()).toBe(original);
      f.dispatch.mockClear();
      await f.start('collectRecovery');
      await f.start('sendRecovery');
      expect(f.dispatch).not.toHaveBeenCalled();
    }
  );
  it('uses the guarded production default without invoking transport', async () => {
    const f = fixture({ guarded: true });
    await f.start('sendRecovery');
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.latest().recovery.state).toBe('submission-uncertain');
  });
  it.each(['digest', 'decode'])(
    'holds a collected picture after %s admission fails without retaining or ACKing it',
    async (failure) => {
      const f = fixture();
      await f.start('sendRecovery');
      f.dispatch.mockClear();
      if (failure === 'decode')
        f.admit.mockRejectedValueOnce(new Error('synthetic full decoder rejection'));
      else {
        const original = f.dispatch.getMockImplementation();
        f.dispatch.mockImplementationOnce(async (...args) => {
          const reply = await original(...args);
          return { ...reply, reply: { ...reply.reply, digest: 'f'.repeat(64) } };
        });
      }
      await f.start('collectRecovery');
      expect(f.storage.retainRecoveryResult).not.toHaveBeenCalled();
      expect(f.storage.recordAck).not.toHaveBeenCalled();
      expect(f.dispatch).toHaveBeenCalledOnce();
    }
  );
  it('authoritatively rereads lost retention and retries only exact ACK under fresh permission', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const original = f.storage.retainRecoveryResult.getMockImplementation();
    f.storage.retainRecoveryResult.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('synthetic lost retention callback');
    });
    await f.start('collectRecovery');
    expect(f.latest().recovery.state).toBe('retained');
    f.dispatch.mockClear();
    f.parent.request.mockClear();
    await f.start('collectRecovery');
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.dispatch.mock.calls[0][1].recovery.kind).toBe('ack');
    expect(f.parent.request).toHaveBeenCalledOnce();
  });
  it('rejects a different delivery receipt after delivery-pinned restart', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const before = f.latest();
    const pinned = f.save({
      ...before,
      recovery: {
        ...before.recovery,
        state: 'delivery-pinned',
        delivery: {
          expiresAt: before.journal.createdAt + 1200000,
          digest: recoveryDigest(OUTPUT),
          receipt: '1'.repeat(64),
          mime: 'image/png',
          length: OUTPUT.length,
        },
      },
    });
    f.owner.show(pinned);
    f.dispatch.mockClear();
    await f.start('collectRecovery');
    expect(f.latest().recovery.state).toBe('delivery-pinned');
    expect(f.storage.recordAck).not.toHaveBeenCalled();
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it.each(['202', 'malformed', 'late'])(
    'does not record an ACK from a %s reply and keeps retained bytes',
    async (kind) => {
      const f = fixture();
      await f.start('sendRecovery');
      const retain = f.storage.retainRecoveryResult.getMockImplementation();
      f.storage.retainRecoveryResult.mockImplementationOnce(async (...args) => {
        const result = await retain(...args);
        f.owner.close();
        return result;
      });
      await f.start('collectRecovery');
      const retained = f.latest();
      f.owner.show(retained);
      f.dispatch.mockClear();
      const original = f.dispatch.getMockImplementation();
      f.dispatch.mockImplementationOnce(async (...args) => {
        if (kind === 'late') {
          const reply = await original(...args);
          f.owner.close();
          return reply;
        }
        if (kind === 'malformed') throw new Error('synthetic malformed ACK');
        return {
          kind: 'recovery',
          reply: {
            kind: 'status',
            phase: 'acknowledged',
            id: retained.recovery.id,
            expiresAt: retained.recovery.expiry.expiresAt,
            pollAfterMs: 4000,
          },
        };
      });
      await f.start('acknowledgeRecovery');
      expect(f.latest().recovery.state).toBe('retained');
      expect(f.storage.recordAck).not.toHaveBeenCalled();
      expect(f.dispatch).toHaveBeenCalledOnce();
    }
  );
  it('rereads an ACK commit whose callback was lost without dispatching it again', async () => {
    const f = fixture();
    await f.start('sendRecovery');
    const original = f.storage.recordAck.getMockImplementation();
    f.storage.recordAck.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('synthetic lost ACK callback');
    });
    await f.start('collectRecovery');
    expect(f.latest().recovery.state).toBe('acknowledged');
    f.dispatch.mockClear();
    await f.start('acknowledgeRecovery');
    expect(f.dispatch).not.toHaveBeenCalled();
  });
});
