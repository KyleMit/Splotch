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
  let finish;
  const storage = {
    read: vi.fn(async () => journal),
    prepare: vi.fn(async (next) => {
      journal = next;
    }),
    write: vi.fn(async (next) => {
      journal = next;
    }),
    retain: vi.fn(async () => ({ uri: 'file:///owned/result.png', mime: 'image/png' })),
    pictures: vi.fn(async () => []),
  };
  const vault = {
    installationId: vi.fn(async () => INSTALLATION),
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
    bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
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
  f.admit.mockRejectedValue(new Error('native corrupt decode'));
  const work = f.owner.generate();
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce());
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
