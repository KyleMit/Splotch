import type { DBSchema, IDBPDatabase } from 'idb';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { idbKvStore, lazyIdbDatabase } from './idb';

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }));

vi.mock('idb', () => ({ openDB }));

interface TestDb extends DBSchema {
  records: {
    key: string;
    value: { message: string };
  };
}

beforeEach(() => {
  openDB.mockReset();
});

describe('lazyIdbDatabase', () => {
  it('retries after an open failure and memoizes the successful connection', async () => {
    const openingError = new Error('database unavailable');
    const database = {} as IDBPDatabase<TestDb>;
    openDB.mockRejectedValueOnce(openingError).mockResolvedValueOnce(database);
    const getDb = lazyIdbDatabase<TestDb>('test-db', 'records');

    expectTypeOf(getDb).toEqualTypeOf<() => Promise<IDBPDatabase<TestDb>>>();
    await expect(getDb()).rejects.toBe(openingError);
    await expect(getDb()).resolves.toBe(database);
    await expect(getDb()).resolves.toBe(database);
    expect(openDB).toHaveBeenCalledTimes(2);
    expect(openDB).toHaveBeenCalledWith('test-db', 1, expect.any(Object));
  });
});

describe('idbKvStore', () => {
  it('delegates typed operations through one memoized database connection', async () => {
    const get = vi.fn().mockResolvedValue({ message: 'stored' });
    const put = vi.fn().mockResolvedValue('record');
    const deleteRecord = vi.fn().mockResolvedValue(undefined);
    const database = { get, put, delete: deleteRecord } as unknown as IDBPDatabase<TestDb>;
    openDB.mockResolvedValue(database);
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
    expect(openDB).toHaveBeenCalledOnce();
  });
});
