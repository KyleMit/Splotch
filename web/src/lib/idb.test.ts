import type { DBSchema, IDBPDatabase } from 'idb';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { lazyIdbDatabase } from './idb';

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }));

vi.mock('idb', () => ({ openDB }));

interface TestDb extends DBSchema {
  records: {
    key: string;
    value: { message: string };
  };
}

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
  });
});
