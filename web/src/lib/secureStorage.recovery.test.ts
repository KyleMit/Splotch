// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { STORAGE_KEYS } from './storageKeys';

vi.mock('$lib/platform', () => ({ isNative: () => false }));

const vault = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  failRead: false,
  failDelete: false,
}));
vi.mock('./idb', () => ({
  lazyIdbDatabase: () => async () => ({
    closed: new Promise<void>(() => {}),
    get: async (_store: string, name: string) => {
      if (vault.failRead) {
        vault.failRead = false;
        throw new Error('transient idb read');
      }
      return vault.rows.get(name);
    },
    delete: async (_store: string, name: string) => {
      if (vault.failDelete) {
        vault.failDelete = false;
        throw new Error('transient idb delete');
      }
      vault.rows.delete(name);
    },
    transaction: () => ({
      store: {
        get: async (name: string) => vault.rows.get(name),
        put: async (value: unknown, name: string) => {
          vault.rows.set(name, value);
        },
      },
      done: Promise.resolve(),
    }),
  }),
}));

const localRows = new Map<string, string>();
beforeEach(() => {
  vault.rows.clear();
  vault.failRead = false;
  vault.failDelete = false;
  localRows.clear();
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => localRows.get(name) ?? null,
    setItem: (name: string, value: string) => {
      localRows.set(name, value);
    },
    removeItem: (name: string) => {
      localRows.delete(name);
    },
  });
});

const CREDENTIALS = [
  {
    kind: 'API key',
    row: 'gemini-api-key',
    legacyKey: STORAGE_KEYS.legacyAiUserApiKey,
    save: 'saveApiKey',
    load: 'loadApiKey',
  },
  {
    kind: 'access code',
    row: 'managed-access-code',
    legacyKey: STORAGE_KEYS.legacyAiAccessToken,
    save: 'saveAccessCode',
    load: 'loadAccessCode',
  },
] as const;
type Credential = (typeof CREDENTIALS)[number];

async function freshLaunch(credential: Credential) {
  vi.resetModules();
  const secure = await import('./secureStorage');
  const { createSecureCredentialCoordinator } = await import('./state/secureCredentialCoordinator');
  let visible = '';
  const coordinator = createSecureCredentialCoordinator(
    {
      read: () => visible,
      write: (value) => {
        visible = value;
      },
    },
    secure[credential.save]
  );
  return {
    secure,
    coordinator,
    read: () => visible,
    hydrate: () =>
      coordinator.hydrate({ load: secure[credential.load], legacyKey: credential.legacyKey }),
  };
}

async function corrupt(credential: Credential, damage: string) {
  const launch = await freshLaunch(credential);
  await launch.secure[credential.save]('stored-credential');
  if (damage === 'malformed payload') {
    vault.rows.set(credential.row, { iv: 'bad', data: 'bad' });
  } else {
    vault.rows.set(
      'master-key',
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ])
    );
  }
}

describe.each(CREDENTIALS)('$kind encrypted recovery', (credential) => {
  it.each(['malformed payload', 'replaced AES key'])(
    'permits replacement after three fresh launches with %s',
    async (damage) => {
      await corrupt(credential, damage);
      const damagedRow = vault.rows.get(credential.row);
      for (let launchIndex = 0; launchIndex < 3; launchIndex++) {
        const launch = await freshLaunch(credential);
        await expect(launch.hydrate()).rejects.toBeInstanceOf(launch.secure.UnreadableSecretError);
        expect(launch.read()).toBe('');
        expect(vault.rows.get(credential.row)).toBe(damagedRow);
      }
      const launch = await freshLaunch(credential);
      await expect(launch.hydrate()).rejects.toBeInstanceOf(launch.secure.UnreadableSecretError);
      await expect(launch.coordinator.setCredential('replacement')).resolves.toBe(true);
      const reopened = await freshLaunch(credential);
      await reopened.hydrate();
      expect(reopened.read()).toBe('replacement');
    }
  );

  it.each(['malformed payload', 'replaced AES key'])(
    'permits Forget after three fresh launches with %s',
    async (damage) => {
      await corrupt(credential, damage);
      for (let launchIndex = 0; launchIndex < 3; launchIndex++) {
        const launch = await freshLaunch(credential);
        await expect(launch.hydrate()).rejects.toBeInstanceOf(launch.secure.UnreadableSecretError);
      }
      const launch = await freshLaunch(credential);
      await expect(launch.hydrate()).rejects.toBeInstanceOf(launch.secure.UnreadableSecretError);
      await expect(launch.coordinator.setCredential('')).resolves.toBe(true);
      expect(vault.rows.has(credential.row)).toBe(false);
      const reopened = await freshLaunch(credential);
      await reopened.hydrate();
      expect(reopened.read()).toBe('');
    }
  );

  it('refuses replacement and Forget after a transient actual backend read failure', async () => {
    let launch = await freshLaunch(credential);
    await launch.secure[credential.save]('stored-credential');
    const encryptedRow = vault.rows.get(credential.row);
    launch = await freshLaunch(credential);
    vault.failRead = true;
    await expect(launch.hydrate()).rejects.toThrow('transient idb read');
    await expect(launch.coordinator.setCredential('replacement')).resolves.toBe(false);
    await expect(launch.coordinator.setCredential('')).resolves.toBe(false);
    expect(vault.rows.get(credential.row)).toBe(encryptedRow);
    await launch.hydrate();
    await expect(launch.coordinator.setCredential('replacement')).resolves.toBe(true);
  });

  it.each([
    new DOMException('decrypt unavailable', 'InvalidStateError'),
    Object.assign(new Error('spoofed operation error'), {
      name: 'OperationError',
      [Symbol.toStringTag]: 'DOMException',
    }),
  ])('keeps storage unknown when decrypt rejects with %s', async (error) => {
    let launch = await freshLaunch(credential);
    await launch.secure[credential.save]('stored-credential');
    const encryptedRow = vault.rows.get(credential.row);
    launch = await freshLaunch(credential);
    vi.spyOn(crypto.subtle, 'decrypt').mockRejectedValueOnce(error);
    await expect(launch.hydrate()).rejects.toBe(error);
    await expect(launch.coordinator.setCredential('replacement')).resolves.toBe(false);
    await expect(launch.coordinator.setCredential('')).resolves.toBe(false);
    expect(vault.rows.get(credential.row)).toBe(encryptedRow);
  });
});

it('reports real encrypted retired-key cleanup failure and permits replacement', async () => {
  const credential = CREDENTIALS[0];
  const launch = await freshLaunch(credential);
  await launch.secure.saveApiKey('AIzaRetiredStoredCredential');
  const encryptedRow = vault.rows.get(credential.row);
  vault.failDelete = true;
  await expect(
    launch.coordinator.hydrate({
      load: launch.secure.loadApiKey,
      legacyKey: credential.legacyKey,
      isRetired: (await import('./ai/keyFormat')).looksLikeRetiredGeminiKey,
    })
  ).rejects.toThrow('transient idb delete');
  expect(launch.read()).toBe('');
  expect(vault.rows.get(credential.row)).toBe(encryptedRow);
  await expect(launch.coordinator.setCredential('sk-replacement')).resolves.toBe(true);
  await expect(launch.secure.loadApiKey()).resolves.toBe('sk-replacement');
});

it('pins the installed Android rejection boundary used by unreadable classification', async () => {
  const require = createRequire(import.meta.url);
  const pluginRoot = join(dirname(require.resolve('@aparajita/capacitor-secure-storage')), '..');
  const android = join(pluginRoot, 'android/src/main/java/com/aparajita/capacitor/securestorage');
  const errors = readFileSync(join(android, 'KeyStoreException.java'), 'utf8');
  const operations = readFileSync(join(android, 'SecureStorage.java'), 'utf8');
  const base = readFileSync(join(pluginRoot, 'dist/esm/base.js'), 'utf8');
  const { StorageErrorType } = await import('@aparajita/capacitor-secure-storage');
  expect(errors).toContain(
    `errorMap.put(ErrorKind.${StorageErrorType.osError}, "An OS error occurred (%s)")`
  );
  expect(errors).toMatch(
    /String\.format\(\s*message,\s*osException\.getClass\(\)\.getSimpleName\(\)/
  );
  expect(errors).toContain('this.code = kind.toString()');
  expect(errors).toContain('call.reject(this.message, this.code)');
  expect(operations).toMatch(
    /catch \(GeneralSecurityException \| IOException e\)\s*\{\s*exception = new KeyStoreException\(KeyStoreException.ErrorKind.osError, e\)/
  );
  expect(base).toContain('error instanceof CapacitorException');
  expect(base).toContain('new StorageError(error.message, error.code)');
  expect(base).toContain("new StorageError('Invalid data', StorageErrorType.invalidData)");
});
