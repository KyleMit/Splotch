export function createSecureCredentialCoordinator<Key extends string>(
  credentialState: Record<Key, string>,
  credentialKey: Key,
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
        await persistCredential(credentialState[credentialKey]);
        return false;
      }

      credentialState[credentialKey] = value;
      return true;
    });
  }

  function runHydration(operation: (ownsHydration: () => boolean) => Promise<void>) {
    const version = writeVersion;
    return enqueue(async () => {
      try {
        await operation(() => version === writeVersion);
        storedValueUnknown = false;
      } catch (error) {
        storedValueUnknown = true;
        throw error;
      }
    });
  }

  return { setCredential, runHydration };
}
