import { readString, removeKey, type StorageKey } from '../storage';
import { UnreadableSecretError } from '../secureStorage';

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

type StoredValue =
  | { kind: 'uninitialized' }
  | { kind: 'unknown' }
  | { kind: 'unreadable' }
  | { kind: 'known'; value: string };

export function createSecureCredentialCoordinator(
  mirror: CredentialMirror,
  persistCredential: (value: string) => Promise<void>
) {
  let writeVersion = 0;
  // Keep secure writes ordered so an older save already in flight cannot finish
  // after a replacement and become the credential restored on the next launch.
  let writeQueue = Promise.resolve();
  // A rejected read may hide a valid secret behind an empty mirror. Only an owned read or write
  // establishes the rollback value; definitely unreadable data has no usable value to preserve.
  let storedValue: StoredValue = { kind: 'uninitialized' };

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
      if (version !== writeVersion || !ownsRequest() || storedValue.kind === 'unknown')
        return false;

      const rollbackValue =
        storedValue.kind === 'known'
          ? storedValue.value
          : storedValue.kind === 'unreadable'
            ? ''
            : mirror.read();

      await persistCredential(value);
      storedValue = { kind: 'known', value };

      if (version !== writeVersion || !ownsRequest()) {
        try {
          await persistCredential(rollbackValue);
          storedValue = { kind: 'known', value: rollbackValue };
        } catch (error) {
          storedValue = { kind: 'unknown' };
          throw error;
        }
        return false;
      }

      mirror.write(value);
      return true;
    });
  }

  function runHydration(
    operation: (
      ownsHydration: () => boolean,
      rememberStoredValue: (value: string) => void,
      rememberPersistedValue: (value: string) => void
    ) => Promise<void>
  ) {
    const version = writeVersion;
    return enqueue(async () => {
      if (storedValue.kind === 'uninitialized' || storedValue.kind === 'unreadable') {
        storedValue = { kind: 'unknown' };
      }
      const ownsHydration = () => version === writeVersion;
      let storedValueProof: StoredValue | undefined;
      // Queue ownership orders physical mutations even when UI ownership changes mid-write.
      const rememberPersistedValue = (value: string) => {
        storedValueProof = { kind: 'known', value };
        storedValue = storedValueProof;
      };
      const rememberStoredValue = (value: string) => {
        if (ownsHydration()) rememberPersistedValue(value);
      };
      try {
        await operation(ownsHydration, rememberStoredValue, rememberPersistedValue);
      } catch (error) {
        if (ownsHydration()) {
          storedValue =
            storedValueProof ??
            (error instanceof UnreadableSecretError ? { kind: 'unreadable' } : { kind: 'unknown' });
        }
        throw error;
      }
      // A stale read cannot establish a baseline; completed mutations record their proof separately.
      if (ownsHydration())
        storedValue = storedValueProof ?? { kind: 'known', value: mirror.read() };
    });
  }

  // Pull the stored credential into the mirror on boot. One-time migration: a
  // plaintext copy an earlier build left moves into secure storage before it
  // is scrubbed, so a failed secure write rejects with the plaintext intact
  // for a later launch to retry.
  function hydrate({ load, legacyKey, isRetired }: StoredCredential) {
    return runHydration(async (ownsHydration, rememberStoredValue, rememberPersistedValue) => {
      let stored = await load();
      const legacy = readString(legacyKey, '');
      if (!ownsHydration()) return;

      if (!stored && legacy && !mirror.read()) {
        await persistCredential(legacy);
        rememberPersistedValue(legacy);
        stored = legacy;
      }

      if (legacy) removeKey(legacyKey);

      rememberStoredValue(stored ?? '');

      if (mirror.read() || !ownsHydration() || !stored) return;
      if (isRetired?.(stored)) {
        await persistCredential('');
        rememberPersistedValue('');
      } else mirror.write(stored);
    });
  }

  return { setCredential, runHydration, hydrate };
}
