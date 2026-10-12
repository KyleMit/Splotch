// Promise wrapper over the event-based IndexedDB API, covering the operations
// lib/idb.ts performs on the app's single-store key/value databases. It is
// reached only through a dynamic import so it stays off the boot path — see
// the comment on lazyIdbDatabase.
//
// The store is created on first open and the version never moves, so there is
// no migration path here and `blocked` (which only fires on a version change
// with another connection open) cannot be reached.
const DATABASE_VERSION = 1;

export type DBSchema = Record<string, { key: IDBValidKey; value: unknown }>;

// `keyof` on a schema interface returns the index signature's `string | number`
// beside the declared store names, which widens every derived key and value
// back to the index signature's own types. Remapping the declared keys through
// a fresh object type drops the signature and leaves the literal names.
type DeclaredKeys<Schema> = keyof {
  [Name in keyof Schema as string extends Name ? never : number extends Name ? never : Name]: true;
};

export type StoreNames<Schema extends DBSchema> = DeclaredKeys<Schema> & string;
export type StoreKey<
  Schema extends DBSchema,
  Name extends StoreNames<Schema>,
> = Schema[Name]['key'];
export type StoreValue<
  Schema extends DBSchema,
  Name extends StoreNames<Schema>,
> = Schema[Name]['value'];

// A transaction commits itself as soon as the event loop turns with none of its
// own requests outstanding, so `store` stays usable only while awaiting the
// operations below — awaiting anything else first closes it. `done` settles
// when the browser commits or aborts. Unlike the database methods, opening one
// throws rather than rejecting when the store or connection is unusable: it
// hands back a handle, not a promise, so there is nothing to reject.
export interface IdbTransaction<Schema extends DBSchema, Name extends StoreNames<Schema>> {
  store: {
    get(key: StoreKey<Schema, Name>): Promise<StoreValue<Schema, Name> | undefined>;
    put(value: StoreValue<Schema, Name>, key: StoreKey<Schema, Name>): Promise<void>;
  };
  done: Promise<void>;
}

export interface IdbDatabase<Schema extends DBSchema> {
  // Settles once this connection can no longer be used: the browser closed it
  // on its own, or it closed itself to let another connection's version change
  // or deletion proceed. Never rejects.
  closed: Promise<void>;
  get<Name extends StoreNames<Schema>>(
    storeName: Name,
    key: StoreKey<Schema, Name>
  ): Promise<StoreValue<Schema, Name> | undefined>;
  put<Name extends StoreNames<Schema>>(
    storeName: Name,
    value: StoreValue<Schema, Name>,
    key: StoreKey<Schema, Name>
  ): Promise<void>;
  delete<Name extends StoreNames<Schema>>(
    storeName: Name,
    key: StoreKey<Schema, Name>
  ): Promise<void>;
  transaction<Name extends StoreNames<Schema>>(
    storeName: Name,
    mode: IDBTransactionMode
  ): IdbTransaction<Schema, Name>;
}

// IndexedDB reports failure by leaving the reason on the request or transaction
// rather than by throwing, and a DOMException is not always present, so every
// rejection below falls back to naming the operation that failed.
function failure(reason: DOMException | null, description: string): Error {
  return reason ?? new Error(description);
}

function requestResult<T>(request: IDBRequest<T>, description: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error, description));
  });
}

async function requestDone(request: IDBRequest, description: string): Promise<void> {
  await requestResult(request, description);
}

function objectStore<Schema extends DBSchema, Name extends StoreNames<Schema>>(
  database: IDBDatabase,
  storeName: Name,
  mode: IDBTransactionMode
): IDBObjectStore {
  return database.transaction(storeName, mode).objectStore(storeName);
}

function transactionDone(transaction: IDBTransaction, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(failure(transaction.error, `The ${storeName} transaction failed`));
    transaction.onabort = () =>
      reject(failure(transaction.error, `The ${storeName} transaction was aborted`));
  });
}

// The browser closes a connection without being asked — WebKit drops a
// backgrounded page's, clearing site data force-closes every one — and it asks
// a connection to step aside before another one upgrades or deletes the
// database. `close()` fires no close event, so stepping aside settles this
// explicitly.
function connectionClosed(database: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    database.onclose = () => resolve();
    database.onversionchange = () => {
      database.close();
      resolve();
    };
  });
}

function wrapDatabase<Schema extends DBSchema>(database: IDBDatabase): IdbDatabase<Schema> {
  // Each is async because opening the transaction is the one call here that
  // reports failure by throwing rather than through onerror — a store that does
  // not exist, or a connection the browser has force-closed. A plain arrow would
  // throw that synchronously out of a method the type says returns a promise.
  return {
    closed: connectionClosed(database),
    get: async (storeName, key) =>
      requestResult(objectStore(database, storeName, 'readonly').get(key), `Reading ${storeName}`),
    put: async (storeName, value, key) =>
      requestDone(
        objectStore(database, storeName, 'readwrite').put(value, key),
        `Writing ${storeName}`
      ),
    delete: async (storeName, key) =>
      requestDone(
        objectStore(database, storeName, 'readwrite').delete(key),
        `Deleting from ${storeName}`
      ),
    transaction: (storeName, mode) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      return {
        store: {
          get: (key) => requestResult(store.get(key), `Reading ${storeName}`),
          put: (value, key) => requestDone(store.put(value, key), `Writing ${storeName}`),
        },
        done: transactionDone(transaction, storeName),
      };
    },
  };
}

export function openDatabase<Schema extends DBSchema>(
  name: string,
  storeName: StoreNames<Schema>
): Promise<IdbDatabase<Schema>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(wrapDatabase<Schema>(request.result));
    request.onerror = () => reject(failure(request.error, `Opening the ${name} database failed`));
  });
}
