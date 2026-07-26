import type { IDBPDatabase } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { lazyIdbDatabase } from './idb';

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }));

vi.mock('idb', () => ({ openDB }));

describe('lazyIdbDatabase', () => {
  it('retries after an open failure and memoizes the successful connection', async () => {
    const openingError = new Error('database unavailable');
    const database = {} as IDBPDatabase;
    openDB.mockRejectedValueOnce(openingError).mockResolvedValueOnce(database);
    const getDb = lazyIdbDatabase('test-db', 'records');

    await expect(getDb()).rejects.toBe(openingError);
    await expect(getDb()).resolves.toBe(database);
    await expect(getDb()).resolves.toBe(database);
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});
