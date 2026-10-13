import type { AiCredentialLease, AiReferencedVault, AiVault } from './credentials';

type VaultOwner = AiVault & Omit<AiReferencedVault, 'lease' | 'pinLeased'>;
export function withCredentialLeases(vault: VaultOwner): AiVault & AiReferencedVault {
  let generation = 0;
  let pending = 0;
  const lease = (owned = generation): AiCredentialLease =>
    Object.freeze({ valid: () => owned === generation && pending === 0 });
  const mutate = <T>(
    work: () => Promise<T>
  ): Promise<Readonly<{ value: T; lease: AiCredentialLease }>> => {
    const owned = ++generation;
    pending += 1;
    let result: Promise<T>;
    try {
      result = work();
    } catch (error) {
      result = Promise.reject(error);
    }
    return result
      .then((value) => {
        if (generation !== owned) throw new Error('AI credential generation changed.');
        return Object.freeze({ value, lease: lease(owned) });
      })
      .finally(() => {
        pending -= 1;
      });
  };
  return {
    // Browser reads can initialize the key or installation seed; native pin can migrate a reference.
    installationId: () => mutate(() => vault.installationId()).then(({ value }) => value),
    read: (kind) => mutate(() => vault.read(kind)).then(({ value }) => value),
    pin: (kind) => mutate(() => vault.pin(kind)).then(({ value }) => value),
    pinLeased: (kind) =>
      mutate(() => vault.pin(kind)).then(({ value, lease }) =>
        Object.freeze({ reference: value, lease })
      ),
    readReferenced: (reference) => vault.readReferenced(reference),
    lease: () => lease(),
    write: (kind, value) => mutate(() => vault.write(kind, value)).then(() => {}),
    remove: (kind) => mutate(() => vault.remove(kind)).then(() => {}),
  };
}
