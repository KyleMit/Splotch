// Lazily open (and memoize) an IndexedDB database with a single object store.
// The idb package is dynamically imported on first use so it never lands in the
// boot bundle; every later call reuses the same connection promise.
export function lazyIdbDatabase(
  dbName: string,
  storeName: string,
  version = 1
): () => Promise<import('idb').IDBPDatabase> {
  let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
  return () => {
    if (!dbPromise) {
      dbPromise = import('idb').then(({ openDB }) =>
        openDB(dbName, version, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
          },
        })
      );
    }
    return dbPromise;
  };
}
