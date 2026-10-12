import type { DBSchema, IdbDatabase } from './idbDatabase';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { idbKvStore, lazyIdbDatabase } from './idb';

const persistence = vi.hoisted(() => ({ browser: true, native: false }));
const { openDatabase } = vi.hoisted(() => ({ openDatabase: vi.fn() }));

vi.mock('$app/environment', () => ({
  get browser() {
    return persistence.browser;
  },
}));

vi.mock('./idbDatabase', () => ({ openDatabase }));

vi.mock('$lib/platform', () => ({
  isNative: () => persistence.native,
}));

interface TestDb extends DBSchema {
  records: {
    key: string;
    value: { message: string };
  };
}

beforeEach(() => {
  openDatabase.mockReset();
  persistence.browser = true;
  persistence.native = false;
  vi.unstubAllGlobals();
});

describe('requestPersistentStorage', () => {
  it('asks the browser to persist storage on the web', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const { requestPersistentStorage } = await import('./idb');

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not request persistence outside the web path', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    persistence.browser = false;
    vi.stubGlobal('navigator', { storage: { persist } });
    const { requestPersistentStorage } = await import('./idb');

    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns false when the browser rejects the persistence request', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { storage: { persist } });
    const { requestPersistentStorage } = await import('./idb');

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('returns false when the browser denies persistent storage', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('navigator', { storage: { persist } });
    const { requestPersistentStorage } = await import('./idb');

    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persist).toHaveBeenCalledOnce();
  });
});

function stubConnection(): IdbDatabase<TestDb> & { close: () => void } {
  let close!: () => void;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  return { closed, close } as unknown as IdbDatabase<TestDb> & { close: () => void };
}

describe('lazyIdbDatabase', () => {
  it('retries after an open failure and memoizes the successful connection', async () => {
    const openingError = new Error('database unavailable');
    const database = stubConnection();
    openDatabase.mockRejectedValueOnce(openingError).mockResolvedValueOnce(database);
    const getDb = lazyIdbDatabase<TestDb>('test-db', 'records');

    expectTypeOf(getDb).toEqualTypeOf<() => Promise<IdbDatabase<TestDb>>>();
    await expect(getDb()).rejects.toBe(openingError);
    await expect(getDb()).resolves.toBe(database);
    await expect(getDb()).resolves.toBe(database);
    expect(openDatabase).toHaveBeenCalledTimes(2);
    expect(openDatabase).toHaveBeenCalledWith('test-db', 'records');
  });

  it('opens a new connection after the browser closes the memoized one', async () => {
    const first = stubConnection();
    const second = stubConnection();
    openDatabase.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const getDb = lazyIdbDatabase<TestDb>('test-db', 'records');

    await expect(getDb()).resolves.toBe(first);
    first.close();
    await first.closed;

    await expect(getDb()).resolves.toBe(second);
    await expect(getDb()).resolves.toBe(second);
    expect(openDatabase).toHaveBeenCalledTimes(2);
  });
});

describe('idbKvStore', () => {
  it('delegates typed operations through one memoized database connection', async () => {
    const get = vi.fn().mockResolvedValue({ message: 'stored' });
    const put = vi.fn().mockResolvedValue('record');
    const deleteRecord = vi.fn().mockResolvedValue(undefined);
    const database = {
      closed: new Promise<void>(() => {}),
      get,
      put,
      delete: deleteRecord,
    } as unknown as IdbDatabase<TestDb>;
    openDatabase.mockResolvedValue(database);
    const records = idbKvStore<TestDb>('test-db', 'records');

    expectTypeOf(records.get).toEqualTypeOf<
      (key: string) => Promise<{ message: string } | undefined>
    >();
    expectTypeOf(records.put).toEqualTypeOf<
      (key: string, value: { message: string }) => Promise<void>
    >();
    expectTypeOf(records.delete).toEqualTypeOf<(key: string) => Promise<void>>();

    await expect(records.get('first')).resolves.toEqual({ message: 'stored' });
    await records.put('second', { message: 'new' });
    await records.delete('third');

    expect(get).toHaveBeenCalledWith('records', 'first');
    expect(put).toHaveBeenCalledWith('records', { message: 'new' }, 'second');
    expect(deleteRecord).toHaveBeenCalledWith('records', 'third');
    expect(openDatabase).toHaveBeenCalledOnce();
  });
});
