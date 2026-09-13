import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DBSchema } from './idbDatabase';
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
  const request: StubRequest = {
    result: stubDatabase(),
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
};

let upgradeNeeded: boolean;
let rows: Map<string, unknown>;
let createdStores: string[];
let existingStores: string[];
let transactionsOpened: { store: string; mode: string }[];

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
    objectStoreNames: { contains: (name: string) => existingStores.includes(name) },
    createObjectStore: (name: string) => {
      createdStores.push(name);
      existingStores.push(name);
    },
    transaction: (storeName: string, mode: string) => {
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
  failures.open = null;
  failures.read = null;
  failures.write = null;
  failures.transaction = null;
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
