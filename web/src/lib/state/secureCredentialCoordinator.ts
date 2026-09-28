import { readString, removeKey, type StorageKey } from '../storage';

// The in-memory mirror of a secret that lives in secure storage: the settings
// module owns the value, and the coordinator is its only production writer.
export interface CredentialMirror {
  read(): string;
  write(value: string): void;
}

interface StoredCredential {
  load(): Promise<string | null>;
  // Where an earlier build kept the credential in plaintext localStorage.
  legacyKey: StorageKey;
  // A stored value this recognises is forgotten instead of restored.
  isRetired?(stored: string): boolean;
}

export function createSecureCredentialCoordinator(
  mirror: CredentialMirror,
  persistCredential: (value: string) => Promise<void>
) {
  let writeVersion = 0;
  // Keep secure writes ordered so an older save already in flight cannot finish
  // after a replacement and become the credential restored on the next launch.
  let writeQueue = Promise.resolve();
  // The abandoned-write rollback re-persists the in-memory mirror, which only
  // reflects storage once a hydration has completed. After one that rejected,
  // memory may hold '' over a stored secret, so that rollback would erase it.
  // With nothing trustworthy to roll back to, a write is refused rather than
  // started, until a hydration completes.
  let storedValueUnknown = false;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function setCredential(value: string, ownsRequest: () => boolean = () => true) {
    const version = ++writeVersion;
    return enqueue(async () => {
      if (version !== writeVersion || !ownsRequest() || storedValueUnknown) return false;

      await persistCredential(value);

      if (version !== writeVersion) return false;
      if (!ownsRequest()) {
        await persistCredential(mirror.read());
        return false;
      }

      mirror.write(value);
      return true;
    });
  }

  function runHydration(operation: (ownsHydration: () => boolean) => Promise<void>) {
    const version = writeVersion;
    return enqueue(async () => {
      try {
        await operation(() => version === writeVersion);
      } catch (error) {
        storedValueUnknown = true;
        throw error;
      }
      // A superseded hydration returned at its ownership guard without touching
      // the mirror, so it proves nothing about what storage holds.
      if (version === writeVersion) storedValueUnknown = false;
    });
  }

  // Pull the stored credential into the mirror on boot. One-time migration: a
  // plaintext copy an earlier build left moves into secure storage before it
  // is scrubbed, so a failed secure write rejects with the plaintext intact
  // for a later launch to retry.
  function hydrate({ load, legacyKey, isRetired }: StoredCredential) {
    return runHydration(async (ownsHydration) => {
      let stored = await load();
      const legacy = readString(legacyKey, '');
      if (!ownsHydration()) return;

      if (!stored && legacy && !mirror.read()) {
        await persistCredential(legacy);
        stored = legacy;
      }

      if (legacy) removeKey(legacyKey);

      if (mirror.read() || !ownsHydration() || !stored) return;
      if (isRetired?.(stored)) await persistCredential('');
      else mirror.write(stored);
    });
  }

  return { setCredential, runHydration, hydrate };
}
