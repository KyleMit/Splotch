// Asks the browser not to evict the origin's storage, and with it the saved AI credential, during
// a low-storage cleanup: shipping's requestPersistentStorage (src/lib/idb.ts, ADR-0128). Best
// effort; a refusal or a missing API leaves the save as it is.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    return false;
  }
  return false;
}
