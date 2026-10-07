import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { exposeHeldRecognizer, heldNamespaceConfiguration } from '../contract.mjs';
import { verifyHeldObservation } from '../report-contract.mjs';

const ROOT = resolve(import.meta.dirname, '../../../..');
const owner = () =>
  readFileSync(resolve(ROOT, 'web/src/lib/drawing/unsavedPictureStore.ts'), 'utf8');
const namespace = () => heldNamespaceConfiguration(owner());

function evaluate(source, dependencies, globals) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(javascript, {
    module,
    exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`L0_TEST_MODULE_UNEXPECTED: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
}

function reader(indexedDB) {
  const naming = evaluate(readFileSync(resolve(ROOT, 'web/src/lib/saveNaming.ts'), 'utf8'), {}, {});
  const realOwner = evaluate(
    exposeHeldRecognizer(owner()),
    {
      '$lib/idb': {
        idbKvStore: () => {
          throw new Error('L0_TEST_WRITER_UNEXPECTED');
        },
      },
      '$lib/saveNaming': naming,
      '$lib/storage': {},
    },
    { ArrayBuffer }
  );
  return evaluate(
    readFileSync(resolve(import.meta.dirname, '../templates/held-reader.ts.template'), 'utf8'),
    {
      './held-owner': { isCurrentHeldPicture: realOwner.isStoredPicture },
      './fixture-config': { fixtureConfig: { heldNamespace: namespace() } },
    },
    { indexedDB, ArrayBuffer, Uint8Array, WeakSet, crypto: webcrypto }
  );
}

function emptyExistingDatabase(events) {
  const db = {
    objectStoreNames: { contains: () => true },
    transaction(storeName, mode) {
      events.push(['transaction', storeName, mode]);
      let calls = 0;
      const tx = {
        objectStore() {
          const request = (result) => {
            const value = { result };
            queueMicrotask(() => value.onsuccess());
            if (++calls === 3)
              queueMicrotask(() => {
                events.push('complete');
                tx.oncomplete();
              });
            return value;
          };
          return {
            get: () => request(undefined),
            count: () => request(0),
            getKey: () => request(undefined),
          };
        },
      };
      return tx;
    },
    close() {
      events.push('close');
    },
  };
  return db;
}

function undefinedControlDatabase(events) {
  const reached = Promise.withResolvers();
  const tx = {
    objectStore() {
      return {
        put(value, key) {
          events.push(['put', value, key]);
          reached.resolve();
        },
      };
    },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction(store, mode) {
      events.push(['transaction', store, mode]);
      return tx;
    },
    close() {
      events.push('close');
    },
  };
  const indexedDB = {
    databases: async () => [{ name: namespace().database, version: 1 }],
    open() {
      const opening = { result: db };
      queueMicrotask(() => opening.onsuccess());
      return opening;
    },
  };
  return { indexedDB, tx, reached };
}

describe('legacy held source owner and readonly flow', () => {
  it('finishes the actual undefined write transaction before closing its database', async () => {
    const events = [];
    const value = undefinedControlDatabase(events);
    let settled = false;
    const command = reader(value.indexedDB)
      .putUndefinedHeldControl()
      .then(() => {
        settled = true;
      });
    await value.reached.promise;
    expect(settled).toBe(false);
    expect(events).toEqual([
      ['transaction', namespace().store, 'readwrite'],
      ['put', undefined, namespace().key],
    ]);
    value.tx.oncomplete();
    await command;
    expect(settled).toBe(true);
    expect(events.at(-1)).toBe('close');
  });

  it('refuses an aborted undefined control and restores the completed transaction', async () => {
    const events = [];
    const value = undefinedControlDatabase(events);
    value.tx.error = new Error('L0_TEST_UNDEFINED_TRANSACTION_ABORTED');
    const command = reader(value.indexedDB).putUndefinedHeldControl();
    await value.reached.promise;
    value.tx.onabort();
    await expect(command).rejects.toThrow(/L0_TEST_UNDEFINED_TRANSACTION_ABORTED/);
    expect(events.at(-1)).toBe('close');
    const restored = undefinedControlDatabase([]);
    const positive = reader(restored.indexedDB).putUndefinedHeldControl();
    await restored.reached.promise;
    restored.tx.oncomplete();
    await expect(positive).resolves.toBeUndefined();
  });

  it('derives the namespace from the actual owner and refuses missing or duplicate literals', () => {
    const bytes = owner();
    expect(namespace()).toEqual({
      database: 'splotch-unsaved-pictures',
      store: 'held',
      key: 'pictures',
    });
    expect(() =>
      heldNamespaceConfiguration(bytes.replace('const DB_NAME =', 'const FOREIGN_NAME ='))
    ).toThrow(/L0_OWNER_LITERAL_CHANGED: DB_NAME/);
    expect(() => heldNamespaceConfiguration(bytes + "\nconst HELD_KEY = 'foreign';")).toThrow(
      /L0_OWNER_LITERAL_CHANGED: HELD_KEY/
    );
    expect(
      heldNamespaceConfiguration(bytes.replace("HELD_KEY = 'pictures'", "HELD_KEY = 'future-key'"))
    ).toEqual({ ...namespace(), key: 'future-key' });
    expect(heldNamespaceConfiguration(bytes)).toEqual(namespace());
  });

  it('exports only the actual recognizer in an owned source overlay and refuses a changed declaration', () => {
    const bytes = owner();
    expect(() =>
      exposeHeldRecognizer(
        bytes.replace('function isStoredPicture(', 'function changedRecognizer(')
      )
    ).toThrow(/L0_OWNER_ANCHOR_CHANGED/);
    expect(exposeHeldRecognizer(bytes)).toBe(
      bytes.replace('function isStoredPicture(', 'export function isStoredPicture(')
    );
    expect(owner()).toBe(bytes);
  });

  it('returns listed committed-database absence without opening or creating a database', async () => {
    let opens = 0;
    const indexedDB = {
      databases: async () => [],
      open: () => {
        opens++;
        throw new Error('L0_TEST_OPEN_UNEXPECTED');
      },
    };
    const value = await reader(indexedDB).readHeldRaw();
    expect(value).toEqual({ status: 'absent-database', databases: [] });
    expect(opens).toBe(0);
    expect(() =>
      verifyHeldObservation(
        { status: 'absent-database', databases: [{ name: namespace().database }] },
        namespace()
      )
    ).toThrow(/L0_HELD_LISTED_DATABASE_NOT_ABSENT/);
    expect(() => verifyHeldObservation(value, namespace())).not.toThrow();
  });

  it('refuses unavailable or failed enumeration before opening and restores absence', async () => {
    let opens = 0;
    const open = () => {
      opens++;
      throw new Error('L0_TEST_OPEN_UNEXPECTED');
    };
    await expect(reader({ open }).readHeldRaw()).rejects.toThrow(/L0_IDB_ENUMERATION_UNQUALIFIED/);
    await expect(
      reader({
        open,
        databases: async () => {
          throw new Error('L0_TEST_ENUMERATION_REFUSED');
        },
      }).readHeldRaw()
    ).rejects.toThrow(/L0_TEST_ENUMERATION_REFUSED/);
    expect(opens).toBe(0);
    expect(await reader({ open, databases: async () => [] }).readHeldRaw()).toEqual({
      status: 'absent-database',
      databases: [],
    });
  });

  it('refuses a listed namespace upgrade instead of calling the race successful absence', async () => {
    let aborted = false;
    const indexedDB = {
      databases: async () => [{ name: namespace().database, version: 1 }],
      open() {
        const opening = {
          transaction: {
            abort() {
              aborted = true;
              queueMicrotask(() => opening.onerror());
            },
          },
        };
        queueMicrotask(() => opening.onupgradeneeded());
        return opening;
      },
    };
    await expect(reader(indexedDB).readHeldRaw()).rejects.toThrow(/L0_IDB_LISTED_SOURCE_CHANGED/);
    expect(aborted).toBe(true);
  });

  it('settles one existing readonly transaction before closing and restoring absent-record output', async () => {
    const events = [];
    const indexedDB = {
      databases: async () => [{ name: namespace().database, version: 1 }],
      open(name) {
        events.push(['open', name]);
        const opening = { result: emptyExistingDatabase(events) };
        queueMicrotask(() => opening.onsuccess());
        return opening;
      },
    };
    const result = await reader(indexedDB).readHeldRaw();
    expect(result).toEqual({ status: 'absent-record', count: 0 });
    expect(events).toEqual([
      ['open', namespace().database],
      ['transaction', namespace().store, 'readonly'],
      'complete',
      'close',
    ]);
    expect(() => verifyHeldObservation(result, namespace())).not.toThrow();
  });

  it('consumes request failure and the later transaction abort before restoring an existing database', async () => {
    const events = [];
    const unhandled = [];
    const collect = (reason) => unhandled.push(reason);
    const db = {
      objectStoreNames: { contains: () => true },
      transaction(storeName, mode) {
        events.push(['transaction', storeName, mode]);
        const tx = {
          error: new Error('L0_TEST_ABORT_AFTER_REQUEST_FAILURE'),
          objectStore() {
            const failed = { error: new Error('L0_TEST_READ_REQUEST_FAILED') };
            const count = { result: 0 };
            const key = { result: undefined };
            queueMicrotask(() => {
              events.push('request-failure');
              failed.onerror();
            });
            queueMicrotask(() => count.onsuccess());
            queueMicrotask(() => key.onsuccess());
            setImmediate(() => {
              events.push('abort');
              tx.onabort();
            });
            return { get: () => failed, count: () => count, getKey: () => key };
          },
        };
        return tx;
      },
      close() {
        events.push('close');
      },
    };
    const indexedDB = {
      databases: async () => [{ name: namespace().database, version: 1 }],
      open() {
        const opening = { result: db };
        queueMicrotask(() => opening.onsuccess());
        return opening;
      },
    };
    process.on('unhandledRejection', collect);
    try {
      await expect(reader(indexedDB).readHeldRaw()).rejects.toThrow(/L0_TEST_READ_REQUEST_FAILED/);
      await new Promise((resolve) => setImmediate(resolve));
      expect(events.filter((event) => event === 'abort')).toHaveLength(1);
      expect(events.filter((event) => event === 'close')).toHaveLength(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', collect);
    }
    const restoredEvents = [];
    indexedDB.open = () => {
      const opening = { result: emptyExistingDatabase(restoredEvents) };
      queueMicrotask(() => opening.onsuccess());
      return opening;
    };
    expect(await reader(indexedDB).readHeldRaw()).toEqual({ status: 'absent-record', count: 0 });
    expect(restoredEvents).toEqual([
      ['transaction', namespace().store, 'readonly'],
      'complete',
      'close',
    ]);
  });

  it('refuses transaction abort after successful requests and restores the completion barrier', async () => {
    const events = [];
    const db = {
      objectStoreNames: { contains: () => true },
      transaction(storeName, mode) {
        events.push(['transaction', storeName, mode]);
        let calls = 0;
        const tx = {
          error: new Error('L0_TEST_TRANSACTION_ABORTED'),
          objectStore() {
            const request = (result) => {
              const value = { result };
              queueMicrotask(() => value.onsuccess());
              if (++calls === 3)
                queueMicrotask(() => {
                  events.push('abort');
                  tx.onabort();
                });
              return value;
            };
            return {
              get: () => request(undefined),
              count: () => request(0),
              getKey: () => request(undefined),
            };
          },
        };
        return tx;
      },
      close() {
        events.push('close');
      },
    };
    const indexedDB = {
      databases: async () => [{ name: namespace().database, version: 1 }],
      open() {
        const opening = { result: db };
        queueMicrotask(() => opening.onsuccess());
        return opening;
      },
    };
    await expect(reader(indexedDB).readHeldRaw()).rejects.toThrow(/L0_TEST_TRANSACTION_ABORTED/);
    expect(events).toEqual([['transaction', namespace().store, 'readonly'], 'abort', 'close']);
    const restoredEvents = [];
    indexedDB.open = () => {
      const opening = { result: emptyExistingDatabase(restoredEvents) };
      queueMicrotask(() => opening.onsuccess());
      return opening;
    };
    expect(await reader(indexedDB).readHeldRaw()).toEqual({ status: 'absent-record', count: 0 });
    expect(restoredEvents).toEqual([
      ['transaction', namespace().store, 'readonly'],
      'complete',
      'close',
    ]);
  });
});
