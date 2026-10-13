import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
const wire = vi.hoisted(() => ({ request: vi.fn() }));
// This controller-only seam reaches status persistence while production recovery transport stays held.
vi.mock('../../experiments/native-architecture/src/ai/transport.ts', async (original) => ({
  ...(await original()),
  requestAi: (...args) => wire.request(...args),
}));
const PREPARE_POINTS = [
  'pin',
  'reference-before-capture',
  'capture',
  'reference-before-create',
  'native-create',
  'reference-before-intent',
  'native-intent',
];
const COLLECT_POINTS = [
  'reference-before-request',
  'request',
  'reference-before-status',
  'native-status',
];
const LIFETIMES = ['background', 'master off', 'dispose'];
const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function held(journal, reference, intent = 'prepared', revision = 1, expiry = { kind: 'unknown' }) {
  return Object.freeze({
    kind: 'recovery-held',
    journal: Object.freeze(journal),
    nonce: 'c'.repeat(64),
    revision,
    originalRevision: 1,
    originalDigest: 'd'.repeat(64),
    inputDigest: 'e'.repeat(64),
    inputLength: rgbaPng(2, 2, 255).length,
    resultDigest: null,
    resultLength: null,
    recovery: Object.freeze({
      version: 2,
      protocol: 'splotch-ai-recovery-v1',
      id: 'a'.repeat(64),
      credential: reference,
      intent,
      expiry: Object.freeze(expiry),
    }),
  });
}
async function fixture(restored = false) {
  const product = createDrawingProduct({ read: async () => null, write: async () => {} }, () => {});
  await product.settings.load();
  const reference = Object.freeze({ kind: 'free', reference: 'b'.repeat(64) });
  const journal = {
    version: 1,
    id: 1,
    createdAt: 1700000000000,
    style: 'Magical',
    originalId: 'picture-1-fixture',
    phase: 'unknown',
    jobId: null,
    result: null,
  };
  let saved = restored ? held(journal, reference, 'committed', 2) : null;
  const vault = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    installationId: vi.fn(async () => 'a'.repeat(64)),
    pin: vi.fn(async () => reference),
    readReferenced: vi.fn(async () => ({ kind: 'free', installationId: 'a'.repeat(64) })),
  };
  const storage = {
    read: vi.fn(async () => (saved ? { kind: 'recovery-held', receipt: saved } : null)),
    pictures: vi.fn(async () => []),
    prepare: vi.fn(),
    write: vi.fn(),
    retain: vi.fn(),
    readPreparedUpload: vi.fn(),
    prepareRecovery: vi.fn(async (next, model, bytes, credential) => {
      saved = held(next, credential);
      return saved;
    }),
    commitRecoveryIntent: vi.fn(async (before) => {
      if (before !== saved) throw new Error('stale native receipt');
      saved = held(before.journal, before.recovery.credential, 'committed', before.revision + 1);
      return saved;
    }),
    recordRecoveryStatus: vi.fn(async (before, status) => {
      if (before !== saved) throw new Error('stale native receipt');
      saved = held(before.journal, before.recovery.credential, 'committed', before.revision + 1, {
        kind: 'known',
        expiresAt: status.expiresAt,
      });
      return saved;
    }),
  };
  const transport = vi.fn();
  wire.request.mockReset();
  wire.request.mockImplementation(async (_, request) =>
    request.path === '/api/free-generation-grant'
      ? { kind: 'grant', remaining: 10 }
      : {
          kind: 'recovery',
          reply: {
            kind: 'status',
            id: saved.recovery.id,
            expiresAt: saved.journal.createdAt + 1200000,
            phase: 'pending',
            pollAfterMs: 4000,
          },
        }
  );
  const prepare = vi.fn(async () => ({
    bytes: rgbaPng(2, 2, 255),
    originalId: 'picture-1-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  }));
  const owner = createNativeAi({
    parent: product.port,
    vault,
    storage,
    transport,
    prepare,
    admit: async () => {},
  });
  cleanups.push(() => {
    owner.dispose();
    product.dispose();
  });
  product.openParentCenter();
  solve(product.gate);
  await product.setAiEnabled(true);
  product.closeParentCenter();
  owner.open();
  owner.refresh();
  solve(product.gate);
  await vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  wire.request.mockClear();
  const start = async (operation) => {
    await owner[operation]();
    solve(product.gate);
  };
  const revoke = async (lifetime) => {
    if (lifetime === 'background') product.background();
    else if (lifetime === 'dispose') owner.dispose();
    else {
      product.openParentCenter();
      solve(product.gate);
      await product.setAiEnabled(false);
    }
  };
  return {
    product,
    owner,
    vault,
    storage,
    transport,
    prepare,
    start,
    revoke,
    saved: () => saved,
    replaceStored: () => {
      saved = held(saved.journal, reference, 'committed', saved.revision + 1);
    },
  };
}
function block(f, point) {
  const wait = deferred();
  const started = deferred();
  const methods = {
    pin: [f.vault.pin, 1],
    'reference-before-capture': [f.vault.readReferenced, 1],
    capture: [f.prepare, 1],
    'reference-before-create': [f.vault.readReferenced, 2],
    'native-create': [f.storage.prepareRecovery, 1],
    'reference-before-intent': [f.vault.readReferenced, 3],
    'native-intent': [f.storage.commitRecoveryIntent, 1],
    'reference-before-request': [f.vault.readReferenced, 1],
    request: [wire.request, 1],
    'reference-before-status': [f.vault.readReferenced, 2],
    'native-status': [f.storage.recordRecoveryStatus, 1],
  };
  const [method, ordinal] = methods[point];
  const original = method.getMockImplementation();
  let calls = 0;
  method.mockImplementation(async (...args) => {
    calls += 1;
    const result = await original(...args);
    if (calls === ordinal) {
      started.resolve();
      await wait.promise;
    }
    return result;
  });
  return { ...wait, started: started.promise };
}
function expectNoLegacy(f) {
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.storage.prepare).not.toHaveBeenCalled();
  expect(f.storage.readPreparedUpload).not.toHaveBeenCalled();
  expect(f.storage.retain).not.toHaveBeenCalled();
  expect(f.vault.write).not.toHaveBeenCalled();
  expect(f.vault.remove).not.toHaveBeenCalled();
}
for (const point of PREPARE_POINTS) {
  it.each(LIFETIMES)(
    `stops subsequent recovery actions at ${point} after %s and preserves an in-flight durable receipt`,
    async (lifetime) => {
      const f = await fixture();
      const wait = block(f, point);
      await f.start('prepareRecovery');
      await wait.started;
      await f.revoke(lifetime);
      wait.resolve();
      await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
      const position = PREPARE_POINTS.indexOf(point);
      expect(f.vault.readReferenced).toHaveBeenCalledTimes([0, 1, 1, 2, 2, 3, 3][position]);
      expect(f.prepare).toHaveBeenCalledTimes(position >= 2 ? 1 : 0);
      expect(f.storage.prepareRecovery).toHaveBeenCalledTimes(position >= 4 ? 1 : 0);
      expect(f.storage.commitRecoveryIntent).toHaveBeenCalledTimes(position === 6 ? 1 : 0);
      expect(f.owner.getState().recovery).toBe(position >= 4 ? f.saved() : null);
      expect(f.owner.getState().message).not.toContain(
        'Your recovery request and original are saved here'
      );
      expect(wire.request).not.toHaveBeenCalled();
      expectNoLegacy(f);
    }
  );
}
for (const point of COLLECT_POINTS) {
  it.each(LIFETIMES)(
    `stops subsequent collection actions at ${point} after %s without dropping a confirmed receipt`,
    async (lifetime) => {
      const f = await fixture(true);
      const original = f.owner.getState().recovery;
      const wait = block(f, point);
      await f.start('collectRecovery');
      await wait.started;
      await f.revoke(lifetime);
      wait.resolve();
      await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
      const position = COLLECT_POINTS.indexOf(point);
      expect(f.vault.readReferenced).toHaveBeenCalledTimes(position >= 2 ? 2 : 1);
      expect(wire.request).toHaveBeenCalledTimes(position === 0 ? 0 : 1);
      expect(f.storage.recordRecoveryStatus).toHaveBeenCalledTimes(position === 3 ? 1 : 0);
      expect(f.owner.getState().recovery).toBe(position === 3 ? f.saved() : original);
      expect(f.owner.getState().message).not.toContain('The server admission expiry is saved');
      expectNoLegacy(f);
    }
  );
}
it('confirms held creation under a still-current real Parent proof without uploading', async () => {
  const f = await fixture();
  await f.start('prepareRecovery');
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  expect(f.storage.commitRecoveryIntent).toHaveBeenCalledOnce();
  expect(f.owner.getState().recovery).toBe(f.saved());
  expect(f.saved().recovery.intent).toBe('committed');
  expect(f.owner.getState().message).toContain('Nothing was uploaded');
  expect(wire.request).not.toHaveBeenCalled();
  expectNoLegacy(f);
});
it('retains authenticated expiry under a still-current real Parent proof without an ACK', async () => {
  const f = await fixture(true);
  await f.start('collectRecovery');
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  expect(f.storage.recordRecoveryStatus).toHaveBeenCalledOnce();
  expect(f.owner.getState().recovery).toBe(f.saved());
  expect(f.saved().recovery.expiry.kind).toBe('known');
  expect(f.owner.getState().message).toContain('The server admission expiry is saved');
  expect(wire.request).toHaveBeenCalledOnce();
  expect(wire.request.mock.calls[0][1].method).toBe('GET');
  expectNoLegacy(f);
});
it('keeps the captured receipt when the storage owner rejects a changed current receipt during collection', async () => {
  const f = await fixture(true);
  const original = f.owner.getState().recovery;
  const wait = block(f, 'request');
  await f.start('collectRecovery');
  await wait.started;
  f.replaceStored();
  wait.resolve();
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  expect(f.storage.recordRecoveryStatus).toHaveBeenCalledWith(
    original,
    expect.objectContaining({ kind: 'status' })
  );
  expect(f.owner.getState().recovery).toBe(original);
  expect(f.owner.getState().message).toBe(
    'Recovery could not be confirmed. The saved request stays held.'
  );
  expect(wire.request).toHaveBeenCalledOnce();
  expectNoLegacy(f);
});
