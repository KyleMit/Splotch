import { withCredentialLeases } from '../../experiments/native-architecture/src/ai/credentialLease.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, expect, it, vi } from 'vitest';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from '../../experiments/native-architecture/src/ai/contract.ts';
const INSTALLATION = 'a'.repeat(64),
  JOB = 'b'.repeat(64);
const image = () => new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } });
function fixture() {
  let journal = null;
  let recovery = null;
  let finish;
  const attempts = new Map();
  const pinned = new Map();
  function receipt(next) {
    return Object.freeze({
      kind: 'prepared',
      journal: Object.freeze({ ...next }),
      nonce: 'c'.repeat(64),
      revision: 1,
      originalRevision: 1,
      originalDigest: 'd'.repeat(64),
      inputDigest: 'e'.repeat(64),
      inputLength: pinned.get(next.id)?.length ?? 1,
      resultDigest: next.result ? 'f'.repeat(64) : null,
      resultLength: next.result ? 1 : null,
    });
  }
  const storage = {
    read: vi.fn(async () =>
      recovery
        ? { kind: 'recovery-held', receipt: recovery }
        : journal
          ? { kind: 'native', receipt: receipt(journal) }
          : null
    ),
    prepareRecovery: vi.fn(async (next, _, bytes, reference) => {
      pinned.set(next.id, bytes.slice());
      recovery = Object.freeze({
        ...receipt(next),
        kind: 'recovery-held',
        recovery: Object.freeze({
          version: 2,
          protocol: 'splotch-ai-recovery-v1',
          id: 'a'.repeat(64),
          credential: reference,
          expiry: Object.freeze({ kind: 'unknown' }),
          intent: 'prepared',
        }),
      });
      return recovery;
    }),
    commitRecoveryIntent: vi.fn(async (value) => {
      recovery = Object.freeze({
        ...value,
        revision: value.revision + 1,
        recovery: Object.freeze({ ...value.recovery, intent: 'committed' }),
      });
      return recovery;
    }),
    recordRecoveryStatus: vi.fn(async () => {
      throw new Error('Recovery transport is held');
    }),
    prepare: vi.fn(async (next, _, bytes) => {
      pinned.set(next.id, bytes.slice());
      journal = next;
      attempts.set(next.id, next);
      return receipt(next);
    }),
    readPreparedUpload: vi.fn(async (value) => pinned.get(value.journal.id).slice()),
    write: vi.fn(async (next) => {
      journal = next;
      attempts.set(next.id, next);
      return receipt(next);
    }),
    retain: vi.fn(async (id) => {
      const picture = { uri: 'file:///owned/result.png', mime: 'image/png' };
      const next = { ...attempts.get(id), phase: 'result', result: picture };
      attempts.set(id, next);
      return { picture, receipt: receipt(next) };
    }),
    pictures: vi.fn(async () => []),
  };
  const vault = {
    installationId: vi.fn(async () => INSTALLATION),
    pin: vi.fn(async (kind) => Object.freeze({ kind, reference: 'b'.repeat(64) })),
    readReferenced: vi.fn(async (reference) =>
      reference.kind === 'free'
        ? { kind: 'free', installationId: INSTALLATION }
        : { kind: reference.kind, value: 'fixture-key' }
    ),
    read: vi.fn(async () => null),
    write: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const post = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const transport = vi.fn((request) =>
    request.path === '/api/free-generation-grant'
      ? Promise.resolve(new Response('{"ok":true,"remaining":10,"limit":10}'))
      : post(request)
  );
  const prepare = vi.fn(async () => ({
    bytes: rgbaPng(2, 2, 255),
    originalId: 'picture-1-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  }));
  const admit = vi.fn(async () => {});
  const owner = createNativeAi({
    storage,
    vault: withCredentialLeases(vault),
    transport,
    prepare,
    admit,
  });
  async function open() {
    owner.open();
    const { x, y } = owner.getState().gate;
    owner.gateInput(String(x * y));
    owner.gateAnswer();
    await vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  }
  return {
    owner,
    admit,
    open,
    storage,
    vault,
    transport,
    post,
    prepare,
    finish: (result) => finish(result),
    takeFinish: () => finish,
  };
}
afterEach(() => vi.useRealTimers());
it('does not refresh credentials or allowance after a secure setup write resolves in a closed visit', async () => {
  const f = fixture();
  await f.open();
  f.post.mockImplementation(async () => new Response('{"ok":true}'));
  let release;
  f.vault.write.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const work = f.owner.setup('byok', 'fixture-key');
  await vi.waitFor(() => expect(f.vault.write).toHaveBeenCalledOnce());
  const reads = f.vault.read.mock.calls.length;
  const requests = f.transport.mock.calls.length;
  f.owner.close();
  release();
  await work;
  expect(f.vault.read).toHaveBeenCalledTimes(reads);
  expect(f.transport).toHaveBeenCalledTimes(requests);
  expect(f.owner.getState().authorized).toBe(false);
  expect(f.owner.getState().message).not.toBe('AI credential saved securely on this device.');
  f.owner.dispose();
});
it('does not refresh credentials after removal resolves in a closed visit', async () => {
  const f = fixture();
  await f.open();
  let release;
  f.vault.remove.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const work = f.owner.removeCredential('managed');
  await vi.waitFor(() => expect(f.vault.remove).toHaveBeenCalledOnce());
  const reads = f.vault.read.mock.calls.length;
  f.owner.close();
  release();
  await work;
  expect(f.vault.read).toHaveBeenCalledTimes(reads);
  expect(f.owner.getState().authorized).toBe(false);
  f.owner.dispose();
});

it('stops an authorized credential refresh between secure reads when the visit closes', async () => {
  const f = fixture();
  let release;
  f.vault.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  f.owner.open();
  const { x, y } = f.owner.getState().gate;
  f.owner.gateInput(String(x * y));
  f.owner.gateAnswer();
  await vi.waitFor(() => expect(f.vault.read).toHaveBeenCalledOnce());
  f.owner.close();
  release(null);
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  expect(f.vault.read).toHaveBeenCalledTimes(1);
  expect(f.vault.installationId).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('explicitly creates a native held recovery request and confirms intent without any recovery or legacy upload', async () => {
  const f = fixture();
  await f.open();
  f.transport.mockClear();
  await f.owner.prepareRecovery();
  const saved = f.owner.getState().recovery;
  expect(saved.recovery.intent).toBe('committed');
  expect(saved.recovery.expiry).toEqual({ kind: 'unknown' });
  expect(f.vault.pin).toHaveBeenCalledOnce();
  expect(f.storage.prepareRecovery).toHaveBeenCalledOnce();
  expect(f.storage.commitRecoveryIntent).toHaveBeenCalledOnce();
  expect(f.storage.prepare).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
  await f.owner.collectRecovery();
  expect(f.vault.readReferenced).toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.storage.recordRecoveryStatus).not.toHaveBeenCalled();
  expect(f.owner.getState().recovery).toBe(saved);
  await f.owner.generate();
  expect(f.transport).not.toHaveBeenCalled();
  f.owner.dispose();
});
it.each(['pin', 'capture', 'native-create', 'intent'])(
  'revokes recovery creation after awaited %s without upload or detached rejection',
  async (point) => {
    const f = fixture();
    await f.open();
    f.transport.mockClear();
    if (point === 'pin')
      f.vault.pin.mockImplementationOnce(async (kind) => {
        f.owner.close();
        return { kind, reference: 'b'.repeat(64) };
      });
    if (point === 'capture')
      f.prepare.mockImplementationOnce(async () => {
        f.owner.close();
        return { bytes: rgbaPng(2, 2, 255), originalId: 'picture-1-fixture', originalModel: '{}' };
      });
    if (point === 'native-create') {
      const create = f.storage.prepareRecovery.getMockImplementation();
      f.storage.prepareRecovery.mockImplementationOnce(async (...args) => {
        const result = await create(...args);
        f.owner.close();
        return result;
      });
    }
    if (point === 'intent') {
      const commit = f.storage.commitRecoveryIntent.getMockImplementation();
      f.storage.commitRecoveryIntent.mockImplementationOnce(async (...args) => {
        const result = await commit(...args);
        f.owner.close();
        return result;
      });
    }
    await f.owner.prepareRecovery();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.getState().authorized).toBe(false);
    expect(f.storage.prepareRecovery).toHaveBeenCalledTimes(
      point === 'pin' || point === 'capture' ? 0 : 1
    );
    expect(f.storage.commitRecoveryIntent).toHaveBeenCalledTimes(point === 'intent' ? 1 : 0);
    f.owner.dispose();
  }
);
it('holds an unknown native create outcome until confirmed readback and refuses a replacement generation', async () => {
  const f = fixture();
  await f.open();
  f.transport.mockClear();
  f.storage.prepareRecovery.mockRejectedValueOnce(new Error('Publication reply lost'));
  await f.owner.prepareRecovery();
  await f.owner.generate();
  await f.owner.setup('byok', 'fixture-key');
  await f.owner.removeCredential('managed');
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.storage.prepare).not.toHaveBeenCalled();
  expect(f.storage.commitRecoveryIntent).not.toHaveBeenCalled();
  expect(f.vault.write).not.toHaveBeenCalled();
  expect(f.vault.remove).not.toHaveBeenCalled();
  f.owner.dispose();
});

it.each(['deadline', 'reply'])(
  'shows the retry card when persisting a poll %s failure fails',
  async (failure) => {
    vi.useFakeTimers();
    const f = fixture();
    f.owner.open();
    const gate = f.owner.getState().gate;
    f.owner.gateInput(String(gate.x * gate.y));
    f.owner.gateAnswer();
    await vi.advanceTimersByTimeAsync(0);
    f.post.mockImplementation((request) =>
      Promise.resolve(
        request.path === '/api/generation-result' && failure === 'reply'
          ? new Response(JSON.stringify({ error: 'Generation failed.' }), { status: 500 })
          : new Response(JSON.stringify({ ok: true, jobId: JOB, pollAfterMs: POLL_INTERVAL_MS }), {
              status: 202,
            })
      )
    );
    await f.owner.generate();
    const write = f.storage.write.getMockImplementation();
    f.storage.write.mockImplementation((journal) =>
      journal.phase === 'failed' ? Promise.reject(new Error('disk full')) : write(journal)
    );
    await vi.advanceTimersByTimeAsync(
      failure === 'deadline' ? POLL_TIMEOUT_MS + POLL_INTERVAL_MS : POLL_INTERVAL_MS
    );
    expect(f.owner.getState()).toMatchObject({
      journal: { phase: 'failed' },
      busy: false,
      failures: 1,
    });
    const posts = f.post.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(f.post).toHaveBeenCalledTimes(posts);
    f.post.mockImplementation(async () => image());
    await f.owner.generate();
    expect(f.owner.getState().journal.phase).toBe('result');
    f.owner.dispose();
  }
);
