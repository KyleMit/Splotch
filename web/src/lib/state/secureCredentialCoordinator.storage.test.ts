import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  get: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.get>(),
  set: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.set>(),
  remove: vi.fn<typeof import('@aparajita/capacitor-secure-storage').SecureStorage.remove>(),
}));

// The iOS plugin resolves Keychain read failures as nil; rejected reads exercise Android's contract.
vi.mock('$lib/platform', () => ({ isNative: () => true, getPlatform: () => 'android' }));
vi.mock('@aparajita/capacitor-secure-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aparajita/capacitor-secure-storage')>()),
  SecureStorage: { get: native.get, set: native.set, remove: native.remove },
}));

import { hydrateAiAccessToken, setAiAccessToken } from './aiAccessToken';
import { hydrateApiKey, setAiUserApiKey } from './aiKey';
import { settingsState } from './settings.svelte';
import { StorageError, StorageErrorType } from '@aparajita/capacitor-secure-storage';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';
import { loadApiKey, loadAccessCode, saveApiKey, saveAccessCode } from '../secureStorage';
import { STORAGE_KEYS } from '../storage';

const CREDENTIALS = [
  {
    name: 'API key',
    slot: 'gemini-api-key',
    hydrate: hydrateApiKey,
    set: setAiUserApiKey,
    read: () => settingsState.aiUserApiKey,
    mirror: settingsState.mirrorAiUserApiKey,
    load: loadApiKey,
    save: saveApiKey,
    legacyKey: STORAGE_KEYS.legacyAiUserApiKey,
  },
  {
    name: 'access code',
    slot: 'managed-access-code',
    hydrate: hydrateAiAccessToken,
    set: setAiAccessToken,
    read: () => settingsState.aiAccessToken,
    mirror: settingsState.mirrorAiAccessToken,
    load: loadAccessCode,
    save: saveAccessCode,
    legacyKey: STORAGE_KEYS.legacyAiAccessToken,
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

beforeEach(async () => {
  native.rows.clear();
  localStorage.clear();
  settingsState.mirrorAiUserApiKey('');
  settingsState.mirrorAiAccessToken('');
  resetNativeBackend();
  await Promise.all(CREDENTIALS.map(({ hydrate }) => hydrate()));
  native.get.mockClear();
});

afterEach(async () => {
  resetNativeBackend();
  await Promise.all(CREDENTIALS.map(({ hydrate }) => hydrate()));
});

describe.each(CREDENTIALS)(
  '$name through the secure-storage backend',
  ({ slot, hydrate, set, read, mirror, load, save, legacyKey }) => {
    it('refuses writes after a real backend read failed', async () => {
      native.rows.set(slot, 'stored-credential');
      native.get.mockRejectedValueOnce(new Error('native backend read failed'));

      await expect(hydrate()).rejects.toThrow('native backend read failed');
      await expect(set('replacement')).resolves.toBe(false);

      expect(read()).toBe('');
      expect(native.rows.get(slot)).toBe('stored-credential');
      expect(native.set).not.toHaveBeenCalled();
      expect(native.remove).not.toHaveBeenCalled();
    });

    it('allows writes after a real backend recovery hydration', async () => {
      native.rows.set(slot, 'stored-credential');
      native.get.mockRejectedValueOnce(new Error('native backend read failed'));
      await expect(hydrate()).rejects.toThrow('native backend read failed');

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

    it('a newer write retains an earlier owned baseline during a delayed read', async () => {
      native.rows.set(slot, 'stored-credential');
      await hydrate();
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

    it.each([
      new StorageError(
        'The data in the store is in an invalid format',
        StorageErrorType.invalidData
      ),
      new StorageError('An OS error occurred (AEADBadTagException)', StorageErrorType.osError),
      new StorageError(
        'An OS error occurred (KeyPermanentlyInvalidatedException)',
        StorageErrorType.osError
      ),
    ])('allows explicit replacement and removal after %s', async (error) => {
      native.rows.set(slot, 'unreadable-credential');
      native.get.mockRejectedValueOnce(error);
      await expect(hydrate()).rejects.toThrow('The stored credential cannot be read');
      expect(native.rows.get(slot)).toBe('unreadable-credential');
      await expect(set('replacement')).resolves.toBe(true);
      expect(read()).toBe('replacement');
      expect(native.rows.get(slot)).toBe('replacement');
      native.get.mockRejectedValueOnce(error);
      await expect(hydrate()).rejects.toThrow('The stored credential cannot be read');
      await expect(set('')).resolves.toBe(true);
      expect(read()).toBe('');
      expect(native.rows.has(slot)).toBe(false);
    });

    it.each([
      new StorageError(
        'An OS error occurred (UserNotAuthenticatedException)',
        StorageErrorType.osError
      ),
      new StorageError('An OS error occurred (IOException)', StorageErrorType.osError),
      new StorageError('An OS error occurred (AEADBadTagException)', StorageErrorType.unknownError),
      Object.assign(new Error('An OS error occurred (AEADBadTagException)'), { code: 'osError' }),
      Object.assign(new Error('Invalid data'), { code: 'invalidData', name: 'StorageError' }),
    ])('preserves an unknown credential after %s', async (error) => {
      native.rows.set(slot, 'stored-credential');
      native.get.mockRejectedValueOnce(error);
      await expect(hydrate()).rejects.toThrow(error.message);
      await expect(set('replacement')).resolves.toBe(false);
      await expect(set('')).resolves.toBe(false);
      expect(native.rows.get(slot)).toBe('stored-credential');
      expect(native.set).not.toHaveBeenCalled();
      expect(native.remove).not.toHaveBeenCalled();
    });

    it.each(['late success', 'transient failure', 'unreadable failure'])(
      'protects an initial read superseded by an abandoned write: %s',
      async (outcome) => {
        native.rows.set(slot, 'stored-credential');
        const coordinator = createSecureCredentialCoordinator({ read, write: mirror }, save);
        const reading = Promise.withResolvers<void>();
        const releaseRead = Promise.withResolvers<void>();
        native.get.mockImplementationOnce(async () => {
          reading.resolve();
          await releaseRead.promise;
          if (outcome === 'transient failure') throw new Error('transient read');
          if (outcome === 'unreadable failure') {
            throw new StorageError('Invalid data', StorageErrorType.invalidData);
          }
          return 'stored-credential';
        });
        const hydration = coordinator.hydrate({ load, legacyKey });
        const settled = hydration.catch(() => undefined);
        await reading.promise;
        let owned = true;
        native.set.mockImplementationOnce(async (name, value) => {
          putNativeSecret(name, value);
          owned = false;
        });
        const write = coordinator.setCredential('abandoned', () => owned);
        releaseRead.resolve();
        await settled;
        await expect(write).resolves.toBe(false);
        expect(read()).toBe('');
        expect(native.rows.get(slot)).toBe('stored-credential');
        expect(native.set).not.toHaveBeenCalled();
        expect(native.remove).not.toHaveBeenCalled();
        await coordinator.hydrate({ load, legacyKey });
        expect(read()).toBe('stored-credential');
      }
    );

    it.each(['replacement', ''])(
      'keeps an unreadable row when %s is abandoned before persistence',
      async (value) => {
        native.rows.set(slot, 'unreadable-credential');
        native.get.mockRejectedValueOnce(
          new StorageError('Invalid data', StorageErrorType.invalidData)
        );
        await expect(hydrate()).rejects.toThrow('The stored credential cannot be read');
        await expect(set(value, () => false)).resolves.toBe(false);
        expect(native.rows.get(slot)).toBe('unreadable-credential');
        expect(native.set).not.toHaveBeenCalled();
        expect(native.remove).not.toHaveBeenCalled();
      }
    );

    it.each(['replacement', ''])(
      'removes an abandoned %s after an owned unreadable read',
      async (value) => {
        native.rows.set(slot, 'unreadable-credential');
        native.get.mockRejectedValueOnce(
          new StorageError('Invalid data', StorageErrorType.invalidData)
        );
        await expect(hydrate()).rejects.toThrow('The stored credential cannot be read');
        let owned = true;
        if (value) {
          native.set.mockImplementationOnce(async (name, saved) => {
            putNativeSecret(name, saved);
            owned = false;
          });
        } else {
          native.remove.mockImplementationOnce(async (name) => {
            owned = false;
            return native.rows.delete(name);
          });
        }
        await expect(set(value, () => owned)).resolves.toBe(false);
        expect(read()).toBe('');
        expect(native.rows.has(slot)).toBe(false);
        expect(native.remove).toHaveBeenCalledWith(slot);
      }
    );

    it.each(['transient', 'unreadable'])(
      'retains an owned rollback baseline after a superseded %s read',
      async (failure) => {
        await set('known-credential');
        const reading = Promise.withResolvers<void>();
        const releaseRead = Promise.withResolvers<void>();
        native.get.mockImplementationOnce(async () => {
          reading.resolve();
          await releaseRead.promise;
          if (failure === 'unreadable')
            throw new StorageError('Invalid data', StorageErrorType.invalidData);
          throw new Error('transient read');
        });
        const hydration = hydrate();
        const settled = hydration.catch(() => undefined);
        await reading.promise;
        let owned = true;
        native.set.mockImplementationOnce(async (name, value) => {
          putNativeSecret(name, value);
          owned = false;
        });
        const write = set('abandoned', () => owned);
        releaseRead.resolve();
        await settled;
        await expect(write).resolves.toBe(false);
        expect(read()).toBe('known-credential');
        expect(native.rows.get(slot)).toBe('known-credential');
        expect(native.set.mock.calls.map(([, value]) => value)).toEqual([
          'known-credential',
          'abandoned',
          'known-credential',
        ]);
      }
    );

    it('orders a superseded corrupt recovery before the owned replacement', async () => {
      native.rows.set(slot, 'unreadable-credential');
      native.get.mockRejectedValueOnce(
        new StorageError('Invalid data', StorageErrorType.invalidData)
      );
      await expect(hydrate()).rejects.toThrow('The stored credential cannot be read');
      const writing = Promise.withResolvers<void>();
      const releaseWrite = Promise.withResolvers<void>();
      native.set.mockImplementationOnce(async (name, value) => {
        writing.resolve();
        await releaseWrite.promise;
        putNativeSecret(name, value);
      });
      const first = set('superseded');
      await writing.promise;
      const second = set('owned');
      releaseWrite.resolve();
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(true);
      expect(read()).toBe('owned');
      expect(native.rows.get(slot)).toBe('owned');
      expect(native.set.mock.calls.map(([, value]) => value)).toEqual(['superseded', 'owned']);
    });

    it.each(['canceled', 'failed'])(
      'restores the owned baseline when a superseding write is %s',
      async (outcome) => {
        await set('prior');
        const writing = Promise.withResolvers<void>();
        const releaseWrite = Promise.withResolvers<void>();
        native.set.mockImplementation(async (name, value) => {
          if (value === 'superseded') {
            writing.resolve();
            await releaseWrite.promise;
          }
          if (value === 'latest' && outcome === 'failed') throw new Error('latest save failed');
          putNativeSecret(name, value);
        });
        const first = set('superseded');
        await writing.promise;
        const second = set('latest', () => outcome !== 'canceled');
        const result = second.catch((error: unknown) => error);
        releaseWrite.resolve();
        await expect(first).resolves.toBe(false);
        const expected = outcome === 'failed' ? new Error('latest save failed') : false;
        expect(await result).toEqual(expected);
        expect(read()).toBe('prior');
        expect(native.rows.get(slot)).toBe('prior');
      }
    );

    it('protects the physical slot when an abandoned-write rollback fails', async () => {
      await set('prior');
      let owned = true;
      native.set
        .mockImplementationOnce(async (name, value) => {
          putNativeSecret(name, value);
          owned = false;
        })
        .mockRejectedValueOnce(new Error('rollback failed'));
      await expect(set('abandoned', () => owned)).rejects.toThrow('rollback failed');
      expect(read()).toBe('prior');
      expect(native.rows.get(slot)).toBe('abandoned');
      const calls = native.set.mock.calls.length;
      await expect(set('replacement')).resolves.toBe(false);
      await expect(set('')).resolves.toBe(false);
      expect(native.set.mock.calls).toHaveLength(calls);
      expect(native.rows.get(slot)).toBe('abandoned');
      await hydrate();
      await expect(set('replacement')).resolves.toBe(true);
      expect(native.rows.get(slot)).toBe('replacement');
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

describe('retired API-key cleanup', () => {
  const retired = 'AIzaRetiredStoredCredential';

  async function failCleanup() {
    native.rows.set('gemini-api-key', retired);
    native.remove.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(hydrateApiKey()).rejects.toThrow('cleanup failed');
    expect(settingsState.aiUserApiKey).toBe('');
    expect(native.rows.get('gemini-api-key')).toBe(retired);
  }

  it('reports failed deletion while permitting the replacement key', async () => {
    await failCleanup();
    await expect(setAiUserApiKey('sk-replacement')).resolves.toBe(true);
    expect(settingsState.aiUserApiKey).toBe('sk-replacement');
    expect(native.rows.get('gemini-api-key')).toBe('sk-replacement');
  });

  it('restores the known retired value when a replacement loses ownership', async () => {
    await failCleanup();
    let owned = true;
    native.set.mockImplementationOnce(async (name, value) => {
      putNativeSecret(name, value);
      owned = false;
    });
    await expect(setAiUserApiKey('sk-abandoned', () => owned)).resolves.toBe(false);
    expect(settingsState.aiUserApiKey).toBe('');
    expect(native.rows.get('gemini-api-key')).toBe(retired);
    expect(native.set.mock.calls.map(([, value]) => value)).toEqual(['sk-abandoned', retired]);
  });

  it('retains a read owned before cleanup was superseded by an abandoned replacement', async () => {
    native.rows.set('gemini-api-key', retired);
    const deleting = Promise.withResolvers<void>();
    const releaseDelete = Promise.withResolvers<void>();
    native.remove.mockImplementationOnce(async () => {
      deleting.resolve();
      await releaseDelete.promise;
      throw new Error('cleanup failed');
    });
    const hydration = hydrateApiKey();
    const settled = hydration.catch(() => undefined);
    await deleting.promise;
    let owned = true;
    native.set.mockImplementationOnce(async (name, value) => {
      putNativeSecret(name, value);
      owned = false;
    });
    const replacement = setAiUserApiKey('sk-abandoned', () => owned);
    releaseDelete.resolve();
    await settled;
    await expect(replacement).resolves.toBe(false);
    expect(settingsState.aiUserApiKey).toBe('');
    expect(native.rows.get('gemini-api-key')).toBe(retired);
    expect(native.set.mock.calls.map(([, value]) => value)).toEqual(['sk-abandoned', retired]);
  });

  it('does not resurrect a retired key when successful cleanup is superseded by an abandoned replacement', async () => {
    native.rows.set('gemini-api-key', retired);
    const deleting = Promise.withResolvers<void>();
    const releaseDelete = Promise.withResolvers<void>();
    native.remove.mockImplementationOnce(async (name) => {
      deleting.resolve();
      await releaseDelete.promise;
      return native.rows.delete(name);
    });
    const hydration = hydrateApiKey();
    await deleting.promise;
    let owned = true;
    native.set.mockImplementationOnce(async (name, value) => {
      putNativeSecret(name, value);
      owned = false;
    });
    const replacement = setAiUserApiKey('sk-abandoned', () => owned);
    releaseDelete.resolve();
    await hydration;
    await expect(replacement).resolves.toBe(false);
    expect(settingsState.aiUserApiKey).toBe('');
    expect(native.rows.has('gemini-api-key')).toBe(false);
    expect(native.set.mock.calls.map(([, value]) => value)).toEqual(['sk-abandoned']);
  });

  it('retries cleanup without restoring the retired key to the mirror', async () => {
    await failCleanup();
    await hydrateApiKey();
    expect(native.rows.has('gemini-api-key')).toBe(false);
    expect(settingsState.aiUserApiKey).toBe('');
    expect(native.remove).toHaveBeenCalledTimes(2);
    await expect(setAiUserApiKey('sk-replacement')).resolves.toBe(true);
  });
});
