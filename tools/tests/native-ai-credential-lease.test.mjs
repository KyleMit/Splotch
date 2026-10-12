import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { withCredentialLeases } from '../../experiments/native-architecture/src/ai/credentialLease.ts';
function fixture() {
  let reject;
  const pending = new Promise((_, fail) => {
    reject = fail;
  });
  /** @type {import('../../experiments/native-architecture/src/ai/credentials.ts').AiVault & Omit<import('../../experiments/native-architecture/src/ai/credentials.ts').AiReferencedVault, 'lease' | 'pinLeased'>} */
  const native = {
    installationId: vi.fn(async () => 'a'.repeat(64)),
    read: vi.fn(async () => null),
    pin: vi.fn(async () => ({ kind: 'free', reference: 'a'.repeat(64) })),
    readReferenced: vi.fn(async () => ({ kind: 'free', installationId: 'a'.repeat(64) })),
    write: vi.fn(() => pending),
    remove: vi.fn(() => pending),
  };
  return { owner: withCredentialLeases(native), native, reject };
}
it.each(['write', 'remove'])(
  'invalidates all earlier leases synchronously when %s begins and keeps them revoked after failure',
  async (method) => {
    const f = fixture();
    const before = f.owner.lease();
    expect(before.valid()).toBe(true);
    const pending =
      method === 'write' ? f.owner.write('byok', 'synthetic-key') : f.owner.remove('managed');
    expect(before.valid()).toBe(false);
    const later = f.owner.lease();
    expect(later.valid()).toBe(false);
    const outcome = pending.catch((error) => error);
    f.reject(new Error('synthetic native mutation failure'));
    expect(await outcome).toBeInstanceOf(Error);
    expect(before.valid()).toBe(false);
  }
);
it('leaves a lease valid across read-only reference resolution', async () => {
  const f = fixture();
  const lease = f.owner.lease();
  await f.owner.readReferenced({ kind: 'free', reference: 'a'.repeat(64) });
  expect(lease.valid()).toBe(true);
});
it('routes both actual platform vault exports through the lease owner', () => {
  const native = readFileSync(
    new URL('../../experiments/native-architecture/src/platform/ai.ts', import.meta.url),
    'utf8'
  );
  const web = readFileSync(
    new URL('../../experiments/native-architecture/src/platform/aiVault.web.ts', import.meta.url),
    'utf8'
  );
  expect(native).toContain('export const aiVault = withCredentialLeases(nativeVault)');
  expect(web).toContain('return withCredentialLeases({');
});

it.each(['installationId', 'read', 'pin'])(
  'invalidates a prior lease before possible initialization or reference migration through %s',
  async (method) => {
    const f = fixture();
    const before = f.owner.lease();
    const operation =
      method === 'installationId'
        ? f.owner.installationId()
        : method === 'read'
          ? f.owner.read('byok')
          : f.owner.pin('free');
    expect(before.valid()).toBe(false);
    await operation;
    expect(before.valid()).toBe(false);
  }
);
it('returns the pin operation own lease without renewing an intervening mutation', async () => {
  const f = fixture();
  const first = await f.owner.pinLeased('free');
  expect(first.lease.valid()).toBe(true);
  let finishPin;
  f.native.pin.mockImplementationOnce(
    () =>
      new Promise((done) => {
        finishPin = done;
      })
  );
  const pin = f.owner.pinLeased('free');
  const outcome = pin.catch((error) => error);
  const write = f.owner.write('byok', 'synthetic-key').catch((error) => error);
  expect(first.lease.valid()).toBe(false);
  finishPin({ kind: 'free', reference: 'a'.repeat(64) });
  expect(await outcome).toBeInstanceOf(Error);
  f.reject(new Error('synthetic write failure'));
  await write;
  expect(first.lease.valid()).toBe(false);
});
