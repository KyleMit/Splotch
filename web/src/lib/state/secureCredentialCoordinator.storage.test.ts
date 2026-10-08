import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  get: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.get>(),
  set: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.set>(),
  remove: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.remove>(),
}));

vi.mock('$lib/platform', () => ({ isNative: () => true, getPlatform: () => 'ios' }));
vi.mock('@aparajita/capacitor-secure-storage', async (importOriginal) => ({
  KeychainAccess: (await importOriginal<typeof import('@aparajita/capacitor-secure-storage')>())
    .KeychainAccess,
  SecureStorage: { get: native.get, set: native.set, remove: native.remove },
}));

import { hydrateAiAccessToken, setAiAccessToken } from './aiAccessToken';
import { hydrateApiKey, setAiUserApiKey } from './aiKey';
import { settingsState } from './settings.svelte';

const CREDENTIALS = [
  {
    name: 'API key',
    slot: 'gemini-api-key',
    hydrate: hydrateApiKey,
    set: setAiUserApiKey,
    read: () => settingsState.aiUserApiKey,
  },
  {
    name: 'access code',
    slot: 'managed-access-code',
    hydrate: hydrateAiAccessToken,
    set: setAiAccessToken,
    read: () => settingsState.aiAccessToken,
  },
] as const;

function putNativeSecret(name: string, value: unknown) {
  if (typeof value !== 'string') throw new Error('Credential fixture requires a string');
  native.rows.set(name, value);
}

function resetNativeBackend() {
  native.get.mockReset().mockImplementation(async (name) => native.rows.get(name) ?? null);
  native.set.mockReset().mockImplementation(async (name, value) => putNativeSecret(name, value));
  native.remove.mockReset().mockImplementation(async (name) => native.rows.delete(name));
}

beforeEach(() => {
  native.rows.clear();
  localStorage.clear();
  settingsState.mirrorAiUserApiKey('');
  settingsState.mirrorAiAccessToken('');
  resetNativeBackend();
});

afterEach(async () => {
  resetNativeBackend();
  await Promise.all(CREDENTIALS.map(({ hydrate }) => hydrate()));
});

describe.each(CREDENTIALS)(
  '$name through the secure-storage backend',
  ({ slot, hydrate, set, read }) => {
    it('refuses writes after a real backend read failed', async () => {
      native.rows.set(slot, 'stored-credential');
      native.get.mockRejectedValueOnce(new Error('secure backend locked'));

      await expect(hydrate()).rejects.toThrow('secure backend locked');
      await expect(set('replacement')).resolves.toBe(false);

      expect(read()).toBe('');
      expect(native.rows.get(slot)).toBe('stored-credential');
      expect(native.set).not.toHaveBeenCalled();
      expect(native.remove).not.toHaveBeenCalled();
    });

    it('allows writes after a real backend recovery hydration', async () => {
      native.rows.set(slot, 'stored-credential');
      native.get.mockRejectedValueOnce(new Error('secure backend locked'));
      await expect(hydrate()).rejects.toThrow('secure backend locked');

      await hydrate();
      await expect(set('replacement')).resolves.toBe(true);

      expect(read()).toBe('replacement');
      expect(native.rows.get(slot)).toBe('replacement');
    });

    it('keeps the live credential when the backend refuses removal', async () => {
      await set('stored-credential');
      native.remove.mockRejectedValueOnce(new Error('secure backend removal failed'));

      await expect(set('')).rejects.toThrow('secure backend removal failed');

      expect(read()).toBe('stored-credential');
      expect(native.rows.get(slot)).toBe('stored-credential');
    });

    it('a successful removal after a failed attempt stays removed during hydration', async () => {
      await set('stored-credential');
      native.remove.mockRejectedValueOnce(new Error('secure backend removal failed'));
      await expect(set('')).rejects.toThrow('secure backend removal failed');

      await expect(set('')).resolves.toBe(true);
      await hydrate();

      expect(read()).toBe('');
      expect(native.rows.has(slot)).toBe(false);
    });

    it('treats a successful absent read as usable storage', async () => {
      await hydrate();
      await expect(set('first-credential')).resolves.toBe(true);

      expect(read()).toBe('first-credential');
      expect(native.rows.get(slot)).toBe('first-credential');
    });

    it('allows removing an already absent credential', async () => {
      await hydrate();

      await expect(set('')).resolves.toBe(true);

      expect(read()).toBe('');
      expect(native.remove).toHaveBeenCalledWith(slot);
      expect(native.rows.has(slot)).toBe(false);
    });

    it('a newer write supersedes a delayed backend read', async () => {
      native.rows.set(slot, 'stored-credential');
      const reading = Promise.withResolvers<void>();
      const releaseRead = Promise.withResolvers<void>();
      native.get.mockImplementationOnce(async (name) => {
        const seen = native.rows.get(name) ?? null;
        reading.resolve();
        await releaseRead.promise;
        return seen;
      });

      const hydration = hydrate();
      await reading.promise;
      const write = set('newer-credential');
      releaseRead.resolve();
      await hydration;
      await expect(write).resolves.toBe(true);

      expect(read()).toBe('newer-credential');
      expect(native.rows.get(slot)).toBe('newer-credential');
    });

    it('serializes backend writes so the latest credential survives', async () => {
      const writing = Promise.withResolvers<void>();
      const releaseWrite = Promise.withResolvers<void>();
      native.set.mockImplementationOnce(async (name, value) => {
        writing.resolve();
        await releaseWrite.promise;
        putNativeSecret(name, value);
      });

      const first = set('first-credential');
      await writing.promise;
      const second = set('second-credential');
      releaseWrite.resolve();
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(true);

      expect(read()).toBe('second-credential');
      expect(native.rows.get(slot)).toBe('second-credential');
      expect(native.set.mock.calls.map(([name, value]) => [name, value])).toEqual([
        [slot, 'first-credential'],
        [slot, 'second-credential'],
      ]);
    });

    it('restores the prior stored credential when request ownership is lost during a write', async () => {
      await set('prior-credential');
      let requestOwned = true;
      native.set.mockImplementationOnce(async (name, value) => {
        putNativeSecret(name, value);
        requestOwned = false;
      });

      await expect(set('abandoned-credential', () => requestOwned)).resolves.toBe(false);

      expect(read()).toBe('prior-credential');
      expect(native.rows.get(slot)).toBe('prior-credential');
    });
  }
);
