import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebAiVault } from '../../experiments/native-architecture/src/platform/aiVault.web.ts';
import { SECRET_SLOTS } from '../../experiments/native-architecture/src/ai/contract.ts';
import {
  INSTALLATION_SEED_ROW,
  MASTER_KEY_ROW,
  VAULT_DATABASE,
  VAULT_STORE,
} from '../../experiments/native-architecture/src/platform/aiVaultRecords.web.ts';

const disk = vi.hoisted(() => ({
  rows: new Map(),
  tail: Promise.resolve(),
  databases: [],
  connections: [],
  abortNextWrite: null,
  beforeCommit: null,
}));

vi.mock('../../web/src/lib/idbDatabase.ts', () => ({
  openDatabase: async (name, store) => {
    disk.databases.push([name, store]);
    let closed = false;
    let resolveClosed;
    const closedPromise = new Promise((resolve) => (resolveClosed = resolve));
    disk.connections.push(() => {
      closed = true;
      resolveClosed();
    });
    return {
      closed: closedPromise,
      transaction(_store, mode) {
        if (closed) throw new Error('The database connection is closed.');
        const previous = disk.tail;
        let resolveDone;
        let rejectDone;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });
        disk.tail = done.catch(() => {});
        let rows;
        let wrote = false;
        const ready = previous.then(() => {
          rows = new Map(disk.rows);
          setImmediate(() => {
            const failure = wrote && disk.abortNextWrite;
            if (failure) {
              disk.abortNextWrite = null;
              rejectDone(failure);
              return;
            }
            if (mode === 'readwrite' && wrote) {
              disk.rows = rows;
              disk.beforeCommit?.();
            }
            resolveDone();
          });
        });
        return {
          store: {
            get: (key) => ready.then(() => structuredClone(rows.get(key))),
            put: (value, key) =>
              ready.then(() => {
                rows.set(key, structuredClone(value));
                wrote = true;
              }),
          },
          done,
        };
      },
    };
  },
}));

beforeEach(() => {
  disk.rows = new Map();
  disk.tail = Promise.resolve();
  disk.databases.length = 0;
  disk.connections.length = 0;
  disk.abortNextWrite = null;
  disk.beforeCommit = null;
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('persists encrypted credentials across fresh vault instances without plaintext or exportable keys', async () => {
  await createWebAiVault().write('byok', 'test-secret-credential');
  const payload = disk.rows.get(SECRET_SLOTS.byok);
  const master = disk.rows.get(MASTER_KEY_ROW);
  expect(payload.data).toBeInstanceOf(ArrayBuffer);
  expect(new TextDecoder().decode(payload.data)).not.toContain('test-secret-credential');
  expect(JSON.stringify([...disk.rows])).not.toContain('test-secret-credential');
  expect(master.key.extractable).toBe(false);
  await expect(webcrypto.subtle.exportKey('raw', master.key)).rejects.toThrow();
  expect(await createWebAiVault().read('byok')).toBe('test-secret-credential');
  expect(disk.databases).toEqual([
    [VAULT_DATABASE, VAULT_STORE],
    [VAULT_DATABASE, VAULT_STORE],
  ]);
  expect(VAULT_DATABASE).not.toBe('splotch-secure');
});

it('atomically adopts one origin-local seed across tabs and hashes only the ADR-0105 purpose', async () => {
  const ids = await Promise.all([
    createWebAiVault().installationId(),
    createWebAiVault().installationId(),
    createWebAiVault().installationId(),
  ]);
  const seed = disk.rows.get(INSTALLATION_SEED_ROW);
  const expected = Buffer.from(
    await webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`splotch-free-generation-v1:${seed}`)
    )
  ).toString('hex');
  expect(ids).toEqual([expected, expected, expected]);
  expect(await createWebAiVault().installationId()).toBe(expected);
  expect(ids[0]).not.toBe(seed);
});

it('adopts a single master key when competing tabs create different credential slots', async () => {
  await Promise.all([
    createWebAiVault().write('byok', 'first-key'),
    createWebAiVault().write('managed', 'managed-code'),
  ]);
  expect(await createWebAiVault().read('byok')).toBe('first-key');
  expect(await createWebAiVault().read('managed')).toBe('managed-code');
  expect(disk.rows.get(SECRET_SLOTS.byok).keyId).toBe(disk.rows.get(MASTER_KEY_ROW).id);
  expect(disk.rows.get(SECRET_SLOTS.managed).keyId).toBe(disk.rows.get(MASTER_KEY_ROW).id);
});

it('rotates references on an identical rewrite and on every removal', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'same-key');
  const first = await vault.pin('byok');
  expect(first.reference).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.isFrozen(first)).toBe(true);
  await vault.write('byok', 'same-key');
  const second = await vault.pin('byok');
  expect(second.reference).not.toBe(first.reference);
  await expect(vault.readReferenced(first)).rejects.toThrow('replaced');
  expect(await vault.readReferenced(second)).toEqual({ kind: 'byok', value: 'same-key' });
  await vault.remove('byok');
  const removed = disk.rows.get(SECRET_SLOTS.byok).reference;
  await expect(vault.readReferenced(second)).rejects.toThrow('removed');
  expect(await vault.read('byok')).toBeNull();
  await expect(vault.pin('byok')).rejects.toThrow('no saved');
  await vault.remove('byok');
  expect(disk.rows.get(SECRET_SLOTS.byok).reference).not.toBe(removed);
});

it.each([
  [MASTER_KEY_ROW, { version: 1, id: 'bad', key: 'plaintext' }],
  [SECRET_SLOTS.byok, { iv: new Uint8Array(12), data: new ArrayBuffer(16) }],
  [INSTALLATION_SEED_ROW, 'not-a-seed'],
])(
  'fails closed on malformed persisted data in %s without overwriting it',
  async (row, malformed) => {
    disk.rows.set(row, malformed);
    const vault = createWebAiVault();
    const operation = row === INSTALLATION_SEED_ROW ? vault.installationId() : vault.read('byok');
    await expect(operation).rejects.toThrow();
    expect(disk.rows.get(row)).toEqual(malformed);
  }
);

it('preserves transaction abort errors and never confirms a request-only write', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const failure = new Error('disk transaction failed');
  disk.abortNextWrite = failure;
  await expect(vault.write('byok', 'replacement-key')).rejects.toBe(failure);
  expect(await vault.read('byok')).toBe('original-key');
});

function deferNextEncryption() {
  let release;
  let entered;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (entered = resolve));
  const original = webcrypto.subtle.encrypt.bind(webcrypto.subtle);
  vi.spyOn(webcrypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
    entered();
    await gate;
    return original(...args);
  });
  return { started, release };
}

it.each(['replace', 'remove'])(
  'rejects a stale in-flight write after another tab does %s',
  async (action) => {
    const vault = createWebAiVault();
    const other = createWebAiVault();
    await vault.write('byok', 'original-key');
    const held = deferNextEncryption();
    const pending = vault.write('byok', 'stale-key');
    const outcome = pending.catch((error) => error);
    await held.started;
    await (action === 'replace' ? other.write('byok', 'winning-key') : other.remove('byok'));
    held.release();
    expect(await outcome).toBeInstanceOf(Error);
    expect(await vault.read('byok')).toBe(action === 'replace' ? 'winning-key' : null);
  }
);

it('rejects a write encrypted through a connection closed during site-data deletion', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const held = deferNextEncryption();
  const outcome = vault.write('byok', 'orphaned-key').catch((error) => error);
  await held.started;
  disk.connections.forEach((close) => close());
  disk.rows.clear();
  held.release();
  expect(await outcome).toBeInstanceOf(Error);
  expect(disk.rows.size).toBe(0);
  expect(await vault.read('byok')).toBeNull();
});

it('requires a successful readback after a committed removal', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const original = disk.rows.get(SECRET_SLOTS.byok);
  disk.beforeCommit = () => disk.rows.set(SECRET_SLOTS.byok, original);
  await expect(vault.remove('byok')).rejects.toThrow('could not be confirmed');
  expect(await vault.read('byok')).toBe('original-key');
});

it('rejects authenticated ciphertext corruption without returning a credential', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const reference = await vault.pin('byok');
  const payload = disk.rows.get(SECRET_SLOTS.byok);
  new Uint8Array(payload.data)[0] ^= 1;
  await expect(vault.read('byok')).rejects.toThrow();
  await expect(vault.readReferenced(reference)).rejects.toThrow();
  await expect(vault.pin('byok')).rejects.toThrow();
});

it('rejects replacement of the master key while encryption is in flight', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const held = deferNextEncryption();
  const outcome = vault.write('byok', 'stale-key').catch((error) => error);
  await held.started;
  disk.rows.set(MASTER_KEY_ROW, {
    version: 1,
    id: 'f'.repeat(64),
    key: await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
  });
  held.release();
  expect(await outcome).toBeInstanceOf(Error);
  await expect(vault.read('byok')).rejects.toThrow('different vault key');
});

it('rejects a pinned credential removed while decryption is in flight', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const reference = await vault.pin('byok');
  let release;
  let entered;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (entered = resolve));
  const original = webcrypto.subtle.decrypt.bind(webcrypto.subtle);
  vi.spyOn(webcrypto.subtle, 'decrypt').mockImplementationOnce(async (...args) => {
    entered();
    await gate;
    return original(...args);
  });
  const outcome = vault.readReferenced(reference).catch((error) => error);
  await started;
  await createWebAiVault().remove('byok');
  release();
  expect(await outcome).toBeInstanceOf(Error);
});

it('rejects a pinned free credential after the origin-local installation changes', async () => {
  const vault = createWebAiVault();
  const reference = await vault.pin('free');
  disk.rows.set(INSTALLATION_SEED_ROW, 'f'.repeat(64));
  await expect(vault.readReferenced(reference)).rejects.toThrow('installation changed');
});

it.each([
  null,
  { kind: 'unknown', reference: 'a'.repeat(64) },
  { kind: 'byok', reference: 'wrong' },
  { kind: 'free', reference: 'a'.repeat(64), extra: true },
])('rejects malformed credential reference %j before opening storage', async (reference) => {
  await expect(createWebAiVault().readReferenced(reference)).rejects.toThrow(
    'reference is invalid'
  );
  expect(disk.databases).toEqual([]);
});

it('preserves encryption failures without altering the committed credential', async () => {
  const vault = createWebAiVault();
  await vault.write('byok', 'original-key');
  const failure = new Error('browser encryption failed');
  vi.spyOn(webcrypto.subtle, 'encrypt').mockRejectedValueOnce(failure);
  await expect(vault.write('byok', 'replacement-key')).rejects.toBe(failure);
  expect(await vault.read('byok')).toBe('original-key');
});
