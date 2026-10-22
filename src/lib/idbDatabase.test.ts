import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DBSchema, StoreKey, StoreNames, StoreValue } from './idbDatabase';
import { openDatabase } from './idbDatabase';

// happy-dom ships no IndexedDB, so this models the parts of the event-based API
// the wrapper drives: requests that settle on a later task through onsuccess /
// onerror, and a transaction that reports its own commit or abort. It exists to
// prove the wrapper's wiring, not IndexedDB's semantics — a real browser
// verifies those.
type StubRequest = {
  result: unknown;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
};

function stubRequest(outcome: { result?: unknown; error?: DOMException }): StubRequest {
  const request: StubRequest = {
    result: outcome.result,
    error: outcome.error ?? null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  // Handlers are assigned by the caller after this returns, so every event is
  // dispatched on a later task, as the browser does.
  queueMicrotask(() => (outcome.error ? request.onerror?.() : request.onsuccess?.()));
  return request;
}

// An open request announces a version change before it succeeds, and only when
// the stored version is behind the requested one.
function stubOpenRequest(): StubRequest {
  if (failures.open) return stubRequest({ error: failures.open });
  const database = stubDatabase();
  openedDatabases.push(database);
  const request: StubRequest = {
    result: database,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  queueMicrotask(() => {
    if (upgradeNeeded) request.onupgradeneeded?.();
    request.onsuccess?.();
  });
  return request;
}

const failures = {
  open: null as DOMException | null,
  read: null as DOMException | null,
  write: null as DOMException | null,
  transaction: null as 'error' | 'abort' | null,
  openingTransaction: null as DOMException | null,
};

let upgradeNeeded: boolean;
let rows: Map<string, unknown>;
let createdStores: string[];
let existingStores: string[];
let transactionsOpened: { store: string; mode: string }[];
let closeCalls: string[];
let openedDatabases: ReturnType<typeof stubDatabase>[];

function stubObjectStore(storeName: string) {
  return {
    get: (key: string) =>
      stubRequest(failures.read ? { error: failures.read } : { result: rows.get(key) }),
    put: (value: unknown, key: string) => {
      if (!failures.write) rows.set(key, value);
      return stubRequest(failures.write ? { error: failures.write } : { result: key });
    },
    delete: (key: string) => {
      if (!failures.write) rows.delete(key);
      return stubRequest(failures.write ? { error: failures.write } : { result: undefined });
    },
    name: storeName,
  };
}

function stubDatabase() {
  return {
    onclose: null as (() => void) | null,
    onversionchange: null as (() => void) | null,
    close: () => closeCalls.push('close'),
    objectStoreNames: { contains: (name: string) => existingStores.includes(name) },
    createObjectStore: (name: string) => {
      createdStores.push(name);
      existingStores.push(name);
    },
    transaction: (storeName: string, mode: string) => {
      if (failures.openingTransaction) throw failures.openingTransaction;
      transactionsOpened.push({ store: storeName, mode });
      const transaction = {
        error: failures.transaction ? new DOMException('transaction failed') : null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => stubObjectStore(storeName),
      };
      queueMicrotask(() => {
        if (failures.transaction === 'error') transaction.onerror?.();
        else if (failures.transaction === 'abort') transaction.onabort?.();
        else transaction.oncomplete?.();
      });
      return transaction;
    },
  };
}

interface TestDb extends DBSchema {
  records: { key: string; value: { message: string } };
}

beforeEach(() => {
  rows = new Map();
  createdStores = [];
  existingStores = [];
  transactionsOpened = [];
  closeCalls = [];
  openedDatabases = [];
  failures.open = null;
  failures.read = null;
  failures.write = null;
  failures.transaction = null;
  failures.openingTransaction = null;
  upgradeNeeded = true;
  vi.stubGlobal('indexedDB', { open: (_name: string, _version: number) => stubOpenRequest() });
});

const open = () => openDatabase<TestDb>('test-db', 'records');

describe('openDatabase', () => {
  it('creates the object store the first time the database is opened', async () => {
    await open();

    expect(createdStores).toEqual(['records']);
  });

  it('creates nothing when the stored database is already at this version', async () => {
    upgradeNeeded = false;
    existingStores = ['records'];
    await open();

    expect(createdStores).toEqual([]);
  });

  it('leaves a store an interrupted earlier upgrade already created alone', async () => {
    existingStores = ['records'];
    await open();

    expect(createdStores).toEqual([]);
  });

  it('rejects with the reason the browser reported', async () => {
    failures.open = new DOMException('quota exceeded');

    await expect(open()).rejects.toBe(failures.open);
  });

  it('names the database when the browser reports a failure with no reason', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: StubRequest = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    });

    await expect(open()).rejects.toThrow('Opening the test-db database failed');
  });
});

describe('database operations', () => {
  it('round-trips a value through put and get', async () => {
    const database = await open();
    await database.put('records', { message: 'stored' }, 'first');

    await expect(database.get('records', 'first')).resolves.toEqual({ message: 'stored' });
  });

  it('resolves undefined for a key that was never written', async () => {
    const database = await open();

    await expect(database.get('records', 'missing')).resolves.toBeUndefined();
  });

  it('removes a row with delete', async () => {
    const database = await open();
    await database.put('records', { message: 'stored' }, 'first');
    await database.delete('records', 'first');

    await expect(database.get('records', 'first')).resolves.toBeUndefined();
  });

  it('reads in a readonly transaction and writes in a readwrite one', async () => {
    const database = await open();
    await database.get('records', 'first');
    await database.put('records', { message: 'stored' }, 'first');
    await database.delete('records', 'first');

    expect(transactionsOpened).toEqual([
      { store: 'records', mode: 'readonly' },
      { store: 'records', mode: 'readwrite' },
      { store: 'records', mode: 'readwrite' },
    ]);
  });

  // Opening the transaction throws rather than reporting through onerror, so a
  // non-async method would throw out of something the type says returns a
  // promise — breaking `db.get(...).catch(…)` and Promise.all for any caller
  // without an enclosing try. `idb`'s own async methods rejected here.
  it.each(['get', 'put', 'delete'] as const)(
    'rejects rather than throwing when %s cannot open its transaction',
    async (method) => {
      const database = await open();
      failures.openingTransaction = new DOMException('no such store', 'NotFoundError');
      const call = () => {
        if (method === 'get') return database.get('records', 'first');
        if (method === 'put') return database.put('records', { message: 'x' }, 'first');
        return database.delete('records', 'first');
      };

      let returned: Promise<unknown> | undefined;
      expect(() => {
        returned = call();
      }).not.toThrow();
      await expect(returned).rejects.toThrow('no such store');
    }
  );

  it('rejects a failed read with the browser reason', async () => {
    const database = await open();
    failures.read = new DOMException('read failed');

    await expect(database.get('records', 'first')).rejects.toBe(failures.read);
  });

  it('rejects a failed write with the browser reason', async () => {
    const database = await open();
    failures.write = new DOMException('write failed');

    await expect(database.put('records', { message: 'x' }, 'first')).rejects.toBe(failures.write);
  });
});

describe('connection lifetime', () => {
  it('settles closed when the browser closes the connection on its own', async () => {
    const database = await open();
    let settled = false;
    void database.closed.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    openedDatabases[0].onclose?.();
    await database.closed;

    expect(closeCalls).toEqual([]);
  });

  it('closes itself and settles closed when another connection changes the version', async () => {
    const database = await open();

    openedDatabases[0].onversionchange?.();
    await database.closed;

    expect(closeCalls).toEqual(['close']);
  });
});

describe('explicit transactions', () => {
  it('runs a read and a write through one transaction that then commits', async () => {
    const database = await open();
    const transaction = database.transaction('records', 'readwrite');

    await expect(transaction.store.get('first')).resolves.toBeUndefined();
    await transaction.store.put({ message: 'written' }, 'first');
    await expect(transaction.done).resolves.toBeUndefined();

    expect(transactionsOpened).toEqual([{ store: 'records', mode: 'readwrite' }]);
    await expect(database.get('records', 'first')).resolves.toEqual({ message: 'written' });
  });

  it('rejects done when the transaction fails', async () => {
    failures.transaction = 'error';
    const database = await open();

    await expect(database.transaction('records', 'readwrite').done).rejects.toThrow(
      'transaction failed'
    );
  });

  it('rejects done when the transaction aborts', async () => {
    failures.transaction = 'abort';
    const database = await open();

    await expect(database.transaction('records', 'readwrite').done).rejects.toThrow(
      'transaction failed'
    );
  });
});

// The schema generics resolve the DECLARED store names, not the index
// signature's `string`. Nothing at runtime notices if that remapping breaks —
// every call still compiles, just against widened keys and `unknown` values —
// so it is asserted at the type level.
describe('schema types', () => {
  interface TwoStoreDb extends DBSchema {
    records: { key: string; value: { message: string } };
    handles: { key: number; value: FileSystemDirectoryHandle };
  }

  it('resolves the declared store names rather than the index signature', () => {
    expectTypeOf<StoreNames<TwoStoreDb>>().toEqualTypeOf<'records' | 'handles'>();
  });

  it("resolves each store's own key and value type", () => {
    expectTypeOf<StoreKey<TwoStoreDb, 'handles'>>().toEqualTypeOf<number>();
    expectTypeOf<StoreValue<TwoStoreDb, 'records'>>().toEqualTypeOf<{ message: string }>();
  });

  it('types the database operations against the store being addressed', async () => {
    const database = await openDatabase<TwoStoreDb>('test-db', 'records');

    expectTypeOf(database.get<'records'>)
      .parameter(1)
      .toEqualTypeOf<string>();
    expectTypeOf(database.get('records', 'first')).resolves.toEqualTypeOf<
      { message: string } | undefined
    >();
    expectTypeOf(database.transaction('records', 'readonly').done).toEqualTypeOf<Promise<void>>();
  });
});
