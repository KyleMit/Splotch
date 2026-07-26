import { browser } from '$app/environment';
import { isNative } from './platform';

// Ask the browser not to evict our IndexedDB during low-storage cleanups. Web only.
export async function requestPersistentStorage() {
  if (!browser || isNative()) return false;
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // ignore — persistence is a best-effort nicety
  }
  return false;
}

// Lazily open (and memoize) an IndexedDB database with a single object store.
// The idb package is dynamically imported on first use so it never lands in the
// boot bundle; every later call reuses the same connection promise.
export function lazyIdbDatabase(
  dbName: string,
  storeName: string
): () => Promise<import('idb').IDBPDatabase>;
export function lazyIdbDatabase<Schema extends import('idb').DBSchema>(
  dbName: string,
  storeName: import('idb').StoreNames<Schema>
): () => Promise<import('idb').IDBPDatabase<Schema>>;
export function lazyIdbDatabase(
  dbName: string,
  storeName: string
): () => Promise<import('idb').IDBPDatabase> {
  let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
  return () => {
    if (!dbPromise) {
      dbPromise = import('idb')
        .then(({ openDB }) =>
          openDB(dbName, 1, {
            upgrade(db) {
              if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
            },
          })
        )
        .catch((error) => {
          dbPromise = null;
          throw error;
        });
    }
    return dbPromise;
  };
}

export function idbKvStore<
  Schema extends import('idb').DBSchema,
  StoreName extends import('idb').StoreNames<Schema> = import('idb').StoreNames<Schema>,
>(dbName: string, storeName: StoreName) {
  const getDb = lazyIdbDatabase<Schema>(dbName, storeName);
  return {
    get: async (key: import('idb').StoreKey<Schema, StoreName>) =>
      (await getDb()).get(storeName, key),
    put: async (
      key: import('idb').StoreKey<Schema, StoreName>,
      value: import('idb').StoreValue<Schema, StoreName>
    ): Promise<void> => {
      await (await getDb()).put(storeName, value, key);
    },
    delete: async (key: import('idb').StoreKey<Schema, StoreName>): Promise<void> => {
      await (await getDb()).delete(storeName, key);
    },
  };
}
