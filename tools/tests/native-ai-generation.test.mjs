import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { REQUEST_TIMEOUT_MS } from '../../experiments/native-architecture/src/ai/contract.ts';
const INSTALLATION = 'a'.repeat(64),
  JOB = 'b'.repeat(64);
const image = () =>
  new Response(rgbaPng(2, 2, 255), {
    headers: { 'Content-Type': 'image/png', 'X-Free-Generations-Remaining': '9' },
  });
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
  const owner = createNativeAi({ storage, vault, transport, prepare, admit });
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
describe('native hosted AI operation ownership', () => {
  it('requires a parent challenge and an explicit send, saves intent before upload and never duplicates a funded request', async () => {
    const f = fixture();
    f.owner.open();
    await f.owner.generate();
    expect(f.post).not.toHaveBeenCalled();
    f.owner.close();
    await f.open();
    expect(f.prepare).not.toHaveBeenCalled();
    const work = f.owner.generate();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
    await f.owner.generate();
    expect(f.post).toHaveBeenCalledOnce();
    expect(f.storage.prepare).toHaveBeenCalledBefore(f.post);
    expect(f.post.mock.calls[0][0]).toMatchObject({
      path: '/api/generate-image',
      query: 'style=Magical',
      headers: {
        'X-Installation-Id': INSTALLATION,
        'X-Async-Generation': '1',
        'Content-Type': 'image/png',
      },
    });
    f.finish(image());
    await work;
    expect(f.owner.getState().journal.phase).toBe('result');
    expect(f.storage.retain).toHaveBeenCalledOnce();
    f.owner.dispose();
  });
  it.each(['file sync', 'directory fsync', 'rename', 'quota', 'unknown native receipt'])(
    'suppresses POST when preupload %s is unconfirmed',
    async (failure) => {
      const f = fixture();
      await f.open();
      f.storage.prepare.mockRejectedValue(new Error(failure));
      f.post.mockResolvedValue(image());
      await f.owner.generate();
      expect(f.post).not.toHaveBeenCalled();
      expect(f.owner.getState().message).toContain('Nothing was sent');
      expect(f.storage.retain).not.toHaveBeenCalled();
      f.owner.dispose();
    }
  );
  it('keeps a ticket across close, resumes polling and retains a late result separately from a new drawing', async () => {
    const f = fixture();
    await f.open();
    const work = f.owner.generate();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
    f.finish(
      new Response(JSON.stringify({ ok: true, jobId: JOB, pollAfterMs: 3000 }), { status: 202 })
    );
    await work;
    f.owner.close();
    expect(f.owner.getState().journal.jobId).toBe(JOB);
    expect(f.prepare).toHaveBeenCalledOnce();
    f.owner.open();
    const challenge = f.owner.getState().gate;
    f.owner.gateInput(String(challenge.x * challenge.y));
    f.owner.gateAnswer();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(2));
    f.owner.close();
    f.finish(image());
    await vi.waitFor(() => expect(f.owner.getState().journal.phase).toBe('result'));
    expect(f.storage.retain).toHaveBeenCalledOnce();
    expect(f.prepare).toHaveBeenCalledOnce();
    f.owner.dispose();
  });
  it('keeps an unknown timeout and collects a transport that resolves late without another POST', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.owner.open();
    const { x, y } = f.owner.getState().gate;
    f.owner.gateInput(String(x * y));
    f.owner.gateAnswer();
    await vi.advanceTimersByTimeAsync(0);
    const work = f.owner.generate();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.post).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await work;
    expect(f.owner.getState().journal.phase).toBe('unknown');
    await f.owner.generate();
    expect(f.post).toHaveBeenCalledOnce();
    f.finish(image());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.owner.getState().journal.phase).toBe('result');
    f.owner.dispose();
  });
  it('cancels permission while preparation is pending without uploading', async () => {
    const f = fixture();
    await f.open();
    let release;
    f.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const work = f.owner.generate();
    f.owner.close();
    release({ bytes: new Uint8Array([1]), originalId: 'picture-1-fixture' });
    await work;
    expect(f.post).not.toHaveBeenCalled();
    f.owner.dispose();
  });
  it('holds a collected image when local retention fails and retries only that local write', async () => {
    const f = fixture();
    await f.open();
    f.storage.retain.mockRejectedValueOnce(new Error('disk full'));
    const work = f.owner.generate();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
    f.finish(image());
    await work;
    expect(f.owner.getState().heldResult.uri).toMatch(/^data:image\/png/);
    f.storage.read.mockRejectedValueOnce(new Error('unconfirmed storage'));
    await f.owner.retryRetention();
    expect(f.owner.getState().message).toContain('Saving could not be confirmed');
    expect(f.storage.retain).toHaveBeenCalledOnce();
    await f.owner.retryRetention();
    expect(f.owner.getState().journal.phase).toBe('result');
    expect(f.post).toHaveBeenCalledOnce();
    f.owner.dispose();
  });
  it('fails closed when the vault cannot be read and never assumes an empty credential', async () => {
    const f = fixture();
    f.vault.read.mockRejectedValue(new Error('vault locked'));
    await f.open();
    await f.owner.generate();
    expect(f.owner.getState().credential).toBe('unavailable');
    expect(f.vault.installationId).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    f.owner.dispose();
  });
  it('verifies a managed code through the production setup caller and fails closed on secure write failure', async () => {
    const f = fixture();
    await f.open();
    f.post.mockResolvedValue(new Response('{"ok":true,"accessCode":"fixture-code"}'));
    f.vault.write.mockRejectedValue(new Error('vault unavailable'));
    await f.owner.setup('managed', 'fixture-code');
    expect(f.post.mock.calls[0][0]).toMatchObject({
      path: '/api/verify-access-code',
      body: '{"code":"fixture-code"}',
    });
    expect(f.vault.write).toHaveBeenCalledWith('managed', 'fixture-code');
    expect(f.owner.getState().credential).toBe('unavailable');
    f.owner.dispose();
  });
});

it('retains a late earlier result after a parent releases an expired attempt', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.owner.open();
  let gate = f.owner.getState().gate;
  f.owner.gateInput(String(gate.x * gate.y));
  f.owner.gateAnswer();
  await vi.advanceTimersByTimeAsync(0);
  const first = f.owner.generate();
  await vi.advanceTimersByTimeAsync(0);
  const finishFirst = f.takeFinish();
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await first;
  const oldId = f.owner.getState().journal.id;
  await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
  f.owner.releaseExpired();
  gate = f.owner.getState().gate;
  f.owner.gateInput(String(gate.x * gate.y));
  f.owner.gateAnswer();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.owner.getState().journal.phase).toBe('failed');
  const second = f.owner.generate();
  await vi.advanceTimersByTimeAsync(0);
  const nextId = f.owner.getState().journal.id;
  expect(nextId).not.toBe(oldId);
  finishFirst(image());
  await vi.advanceTimersByTimeAsync(0);
  expect(f.owner.getState().journal.id).toBe(nextId);
  f.finish(image());
  await second;
  expect(f.storage.retain).toHaveBeenCalledWith(oldId, expect.any(Uint8Array), 'image/png');
  expect(f.post).toHaveBeenCalledTimes(2);
  f.owner.dispose();
});
it('keeps secure removal ambiguous and ignores verification that finishes after parent permission closes', async () => {
  const f = fixture();
  await f.open();
  f.vault.remove.mockRejectedValue(new Error('locked'));
  await f.owner.removeCredential('managed');
  expect(f.owner.getState().credential).toBe('unavailable');
  const work = f.owner.setup('byok', 'fixture-key');
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
  f.owner.close();
  f.finish(new Response('{"ok":true}'));
  await work;
  expect(f.vault.write).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('blocks a new send after parent permission closes even when allowance and credential are loaded', async () => {
  const f = fixture();
  await f.open();
  f.owner.close();
  f.post.mockImplementation(async () => image());
  await f.owner.generate();
  expect(f.post).not.toHaveBeenCalled();
  f.owner.dispose();
});
it('blocks a second explicit send while a funded ticket is pending', async () => {
  const f = fixture();
  await f.open();
  f.post.mockImplementation(
    async () =>
      new Response(JSON.stringify({ ok: true, jobId: JOB, pollAfterMs: 3000 }), { status: 202 })
  );
  await f.owner.generate();
  await f.owner.generate();
  expect(f.post).toHaveBeenCalledOnce();
  f.owner.dispose();
});

it('requires native decode admission before any retention or in-memory result display', async () => {
  const f = fixture();
  await f.open();
  const work = f.owner.generate();
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
  expect(f.admit).toHaveBeenCalledOnce();
  f.admit.mockClear().mockRejectedValue(new Error('native corrupt decode'));
  f.finish(image());
  await work;
  expect(f.admit).toHaveBeenCalledOnce();
  expect(f.storage.retain).not.toHaveBeenCalled();
  expect(f.owner.getState().heldResult).toBeNull();
  expect(f.owner.getState().pictures).toEqual([]);
  expect(f.owner.getState().message).toContain('could not be safely opened');
  expect(f.owner.getState().remaining).toBe(9);
  expect(f.post).toHaveBeenCalledOnce();
  expect(f.owner.getState().journal.phase).toBe('failed');
  f.owner.dispose();
});

it('suppresses funded POST when pinned native readback fails', async () => {
  const f = fixture();
  await f.open();
  f.storage.readPreparedUpload.mockRejectedValue(new Error('pinned digest changed'));
  await f.owner.generate();
  expect(f.post).not.toHaveBeenCalled();
  expect(f.storage.retain).not.toHaveBeenCalled();
  expect(f.owner.getState().journal.originalId).toBe('picture-1-fixture');
  f.owner.dispose();
});
it('rechecks parent permission after the pinned native upload read', async () => {
  const f = fixture();
  await f.open();
  let release;
  f.storage.readPreparedUpload.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const work = f.owner.generate();
  await vi.waitFor(() => expect(f.storage.readPreparedUpload).toHaveBeenCalledOnce());
  f.owner.close();
  release(rgbaPng(2, 2, 255));
  await work;
  expect(f.post).not.toHaveBeenCalled();
  expect(f.owner.getState().journal.originalId).toBe('picture-1-fixture');
  f.owner.dispose();
});
it('uploads the private pinned copy after capture bytes are mutated', async () => {
  const f = fixture();
  await f.open();
  const bytes = rgbaPng(2, 2, 255);
  const expected = bytes.slice();
  f.prepare.mockResolvedValue({
    bytes,
    originalId: 'picture-1-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  });
  const read = f.storage.readPreparedUpload.getMockImplementation();
  f.storage.readPreparedUpload.mockImplementation(async (value) => {
    bytes.fill(0);
    return read(value);
  });
  const work = f.owner.generate();
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
  expect(f.post.mock.calls[0][0].body).toEqual(expected);
  f.finish(image());
  await work;
  f.owner.dispose();
});

it('consumes the actual preparation rejection without a detached sequencing rejection', async () => {
  const f = fixture();
  const unhandled = [];
  const observe = (error) => unhandled.push(error);
  process.on('unhandledRejection', observe);
  try {
    await f.open();
    f.storage.prepare.mockRejectedValue(new Error('controlled preparation fence failure'));
    await f.owner.generate();
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.post).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(f.owner.getState().message).toContain('Nothing was sent');
  } finally {
    process.off('unhandledRejection', observe);
    f.owner.dispose();
  }
});
