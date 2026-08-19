export function createSecureCredentialCoordinator<Key extends string>(
  credentialState: Record<Key, string>,
  credentialKey: Key,
  persistCredential: (value: string) => Promise<void>
) {
  let writeVersion = 0;
  // Keep secure writes ordered so an older save already in flight cannot finish
  // after a replacement and become the credential restored on the next launch.
  let writeQueue = Promise.resolve();

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
      if (version !== writeVersion || !ownsRequest()) return false;

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
    return enqueue(() => operation(() => version === writeVersion));
  }

  return { setCredential, runHydration };
}
