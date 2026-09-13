import { browser } from '$app/environment';
import { isNative } from '$lib/platform';
import type { DBSchema, IdbDatabase, StoreKey, StoreNames, StoreValue } from './idbDatabase';

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
// idbDatabase.ts is dynamically imported on first use so neither it nor an open
// connection lands in the boot bundle; every later call reuses the same
// connection promise.
export function lazyIdbDatabase<Schema extends DBSchema>(
  dbName: string,
  storeName: StoreNames<Schema>
): () => Promise<IdbDatabase<Schema>> {
  let dbPromise: Promise<IdbDatabase<Schema>> | null = null;
  return () => {
    if (!dbPromise) {
      dbPromise = import('./idbDatabase')
        .then(({ openDatabase }) => openDatabase<Schema>(dbName, storeName))
        .catch((error: unknown) => {
          dbPromise = null;
          throw error;
        });
    }
    return dbPromise;
  };
}

export function idbKvStore<
  Schema extends DBSchema,
  StoreName extends StoreNames<Schema> = StoreNames<Schema>,
>(dbName: string, storeName: StoreName) {
  const getDb = lazyIdbDatabase<Schema>(dbName, storeName);
  return {
    get: async (key: StoreKey<Schema, StoreName>) => (await getDb()).get(storeName, key),
    put: async (
      key: StoreKey<Schema, StoreName>,
      value: StoreValue<Schema, StoreName>
    ): Promise<void> => {
      await (await getDb()).put(storeName, value, key);
    },
    delete: async (key: StoreKey<Schema, StoreName>): Promise<void> => {
      await (await getDb()).delete(storeName, key);
    },
  };
}
