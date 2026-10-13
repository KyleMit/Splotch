import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebDrawingDraftStorage,
  protectedDraftPageIds,
} from '../../experiments/native-architecture/src/platform/drawingDraft.web.ts';
import {
  DRAFT_DATABASE,
  DRAFT_STORE,
  LEGACY_DRAFT_KEYS,
} from '../../experiments/native-architecture/src/platform/drawingDraftRecords.web.ts';
import { createDrawingDraft } from '../../experiments/native-architecture/src/product/createDrawingDraft.ts';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import { encodeDrawingDraft } from '../../experiments/native-architecture/src/product/drawingDraft.ts';
import {
  addStroke,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { canonicalPaper } from './native-paper-fixtures.mjs';

// This models serialized IDB transactions and independent connection lifetimes.
// Browser execution remains necessary to verify the browser's scheduling semantics.
const disk = vi.hoisted(() => ({
  rows: new Map(),
  tail: Promise.resolve(),
  connections: [],
  opens: [],
  puts: [],
  nextWriteOutcome: null,
  nextReadAbort: false,
  failRead: false,
  failOpen: false,
  holdCommit: false,
  release: null,
}));
const artwork = vi.hoisted(() => ({ admit: vi.fn() }));

vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: { withSavedArtwork: (...args) => artwork.admit(...args) },
}));
vi.mock('../../web/src/lib/idbDatabase.ts', () => ({
  openDatabase: async (name, store) => {
    disk.opens.push([name, store]);
    if (disk.failOpen) throw new Error('Storage unavailable');
    let closed = false;
    let resolveClosed;
    const closedPromise = new Promise((resolve) => (resolveClosed = resolve));
    disk.connections.push(() => {
      closed = true;
      resolveClosed();
    });
    return {
      closed: closedPromise,
      transaction(_store, mode) {
        if (closed) throw new Error('Connection closed');
        const previous = disk.tail;
        let resolveDone;
        let rejectDone;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });
        disk.tail = done.catch(() => undefined);
        let rows;
        let wrote = false;
        const ready = previous.then(() => {
          rows = structuredClone(disk.rows);
          setImmediate(() => {
            const finish = () => {
              const outcome = wrote ? disk.nextWriteOutcome : null;
              if (wrote) disk.nextWriteOutcome = null;
              const readAbort = !wrote && disk.nextReadAbort;
              if (readAbort) disk.nextReadAbort = false;
              if (mode === 'readwrite' && wrote && outcome !== 'abort') disk.rows = rows;
              if (outcome || readAbort) rejectDone(new Error('Commit was not confirmed'));
              else resolveDone();
            };
            if (wrote && disk.holdCommit) disk.release = finish;
            else finish();
          });
        });
        return {
          store: {
            get: (key) =>
              ready.then(() => {
                if (disk.failRead) throw new Error('Read denied');
                return structuredClone(rows.get(key));
              }),
            put: (value, key) =>
              ready.then(() => {
                wrote = true;
                disk.puts.push([key, structuredClone(value)]);
                rows.set(key, structuredClone(value));
              }),
          },
          done,
        };
      },
    };
  },
}));

const PAGE = `offline:dinosaur:brachiosaurus:${'a'.repeat(64)}`;
const snapshot = (rainbow = 0, page = 'blank') => encodeDrawingDraft(emptyDrawing(rainbow, page));
const owner = (backend = 'legacy') => createWebDrawingDraftStorage(backend);
let backups;
let storage;
const coordinators = [];

function deferred() {
  let resolve;
  const promise = new Promise((accept) => (resolve = accept));
  return { promise, resolve };
}
async function loadedPair() {
  const a = owner();
  const b = owner();
  await Promise.all([a.read(), b.read()]);
  return { a, b };
}

beforeEach(() => {
  disk.rows = new Map();
  disk.tail = Promise.resolve();
  disk.connections = [];
  disk.opens = [];
  disk.puts = [];
  disk.nextWriteOutcome = null;
  disk.nextReadAbort = false;
  disk.failRead = false;
  disk.failOpen = false;
  disk.holdCommit = false;
  disk.release = null;
  backups = new Map();
  storage = {
    getItem: vi.fn((key) => backups.get(key) ?? null),
    setItem: vi.fn((key, value) => backups.set(key, value)),
    removeItem: vi.fn((key) => backups.delete(key)),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { storage: { persist: vi.fn() } });
  artwork.admit.mockReset().mockImplementation((_page, action) => action());
});
afterEach(async () => {
  for (const draft of coordinators.splice(0)) draft.dispose();
  for (const close of disk.connections) close();
  await Promise.resolve();
  vi.unstubAllGlobals();
});

describe('beta browser current-draft ownership', () => {
  it('requires the initial read before a writer can replace the current draft', async () => {
    await expect(owner().write(snapshot())).rejects.toThrow('Recover the current draft');
    expect(disk.puts).toEqual([]);
  });

  it('pins two tabs to the same initial record and refuses the stale writer', async () => {
    const { a, b } = await loadedPair();
    await a.write(snapshot(1, 'flower'));
    await expect(b.write(snapshot(2))).rejects.toThrow('Another tab changed');
    await expect(b.read()).rejects.toThrow('Another tab changed');
    await expect(b.write(snapshot(3))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1, 'flower'));
  });

  it('admits exactly one of two simultaneously submitted tab writes', async () => {
    const { a, b } = await loadedPair();
    const outcomes = await Promise.allSettled([a.write(snapshot(1)), b.write(snapshot(2))]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(disk.rows.get('legacy').revision).toBe(2);
    expect(disk.puts).toHaveLength(2);
  });

  it('does not treat identical content from another tab as this writer’s commit', async () => {
    const { a, b } = await loadedPair();
    await a.write(snapshot(1));
    await expect(b.write(snapshot(1))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy').revision).toBe(2);
  });

  it('cannot resume a conflicted writer by restoring its stale expected record', async () => {
    const { a, b } = await loadedPair();
    const stale = structuredClone(disk.rows.get('legacy'));
    await a.write(snapshot(1));
    await expect(b.write(snapshot(2))).rejects.toThrow('Another tab changed');
    disk.rows.set('legacy', stale);
    await expect(b.read()).rejects.toThrow('Another tab changed');
    await expect(b.write(snapshot(3))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy')).toEqual(stale);
  });

  it('keeps live ink and the Pictures escape route after a cross-tab conflict', async () => {
    const { a, b } = await loadedPair();
    const session = createDrawingSession();
    const draft = createDrawingDraft(session, b, async () => {});
    coordinators.push(draft);
    await draft.start();
    await a.write(snapshot(1, 'flower'));
    session.setHistory((history) =>
      addStroke(
        history,
        { brush: 'pen', color: 'Purple', width: 8, points: [{ x: 10, y: 20 }] },
        canonicalPaper()
      )
    );
    await draft.retry();
    expect(draft.getSnapshot().status).toBe('failed');
    expect(draft.getSnapshot().message).toContain('save it in Pictures');
    expect(session.currentDrawing().strokes).toHaveLength(1);
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1, 'flower'));
  });

  it('waits for transaction.done before publishing a successful write', async () => {
    const storage = owner();
    await storage.read();
    disk.holdCommit = true;
    let settled = false;
    const writing = storage.write(snapshot(1)).then(() => (settled = true));
    await vi.waitFor(() => expect(disk.release).toBeTypeOf('function'));
    expect(settled).toBe(false);
    expect(disk.rows.get('legacy').snapshot).toBeNull();
    disk.holdCommit = false;
    disk.release();
    await writing;
    expect(settled).toBe(true);
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1));
  });

  it('retries an aborted write only after confirming the exact previous record', async () => {
    const storage = owner();
    await storage.read();
    const previous = structuredClone(disk.rows.get('legacy'));
    disk.nextWriteOutcome = 'abort';
    await expect(storage.write(snapshot(1))).rejects.toThrow('not confirmed');
    expect(disk.rows.get('legacy')).toEqual(previous);
    await storage.write(snapshot(2));
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(2));
    expect(disk.rows.get('legacy').revision).toBe(previous.revision + 1);
  });

  it('recovers an unknown commit only by an authoritative read of the exact intended record', async () => {
    const storage = owner();
    await storage.read();
    disk.nextWriteOutcome = 'unknown';
    await expect(storage.write(snapshot(1))).rejects.toThrow('not confirmed');
    const intended = structuredClone(disk.rows.get('legacy'));
    await expect(storage.read()).resolves.toBe(snapshot(1));
    await storage.write(snapshot(2));
    expect(disk.rows.get('legacy').revision).toBe(intended.revision + 1);
    expect(disk.rows.get('legacy').commitId).not.toBe(intended.commitId);
  });

  it('does not adopt an unknown commit before its confirmation read completes', async () => {
    const storage = owner();
    await storage.read();
    disk.nextWriteOutcome = 'unknown';
    await expect(storage.write(snapshot(1))).rejects.toThrow('not confirmed');
    disk.nextReadAbort = true;
    await expect(storage.read()).rejects.toThrow('not confirmed');
    await expect(storage.read()).resolves.toBe(snapshot(1));
    expect(disk.rows.get('legacy').revision).toBe(2);
  });

  it('does not acquire the initial write baseline from a read whose transaction aborts', async () => {
    const seed = owner();
    await seed.read();
    await seed.write(snapshot(1));
    const storage = owner();
    disk.nextReadAbort = true;
    await expect(storage.read()).rejects.toThrow('not confirmed');
    await expect(storage.write(snapshot(2))).rejects.toThrow('Recover the current draft');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1));
  });

  it('refuses to rebase an uncertain writer after a different tab advances the record', async () => {
    const original = owner();
    await original.read();
    disk.nextWriteOutcome = 'unknown';
    await expect(original.write(snapshot(1))).rejects.toThrow('not confirmed');
    const rival = owner();
    await rival.read();
    await rival.write(snapshot(2));
    await expect(original.write(snapshot(3))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(2));
  });

  it('rejects a different commit identity even when an uncertain snapshot and revision match', async () => {
    const storage = owner();
    await storage.read();
    disk.nextWriteOutcome = 'unknown';
    await expect(storage.write(snapshot(1))).rejects.toThrow('not confirmed');
    disk.rows.set('legacy', { ...disk.rows.get('legacy'), commitId: webcrypto.randomUUID() });
    await expect(storage.read()).rejects.toThrow('Another tab changed');
    await expect(storage.write(snapshot(2))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1));
  });

  it('reopens a closed connection without rebasing the existing writer', async () => {
    const { a, b } = await loadedPair();
    await a.write(snapshot(1));
    disk.connections.forEach((close) => close());
    await Promise.resolve();
    await expect(b.write(snapshot(2))).rejects.toThrow('Another tab changed');
    expect(disk.opens).toHaveLength(3);
    expect(
      disk.opens.every(([name, store]) => name === DRAFT_DATABASE && store === DRAFT_STORE)
    ).toBe(true);
  });

  it.each(['missing', 'invalid', 'changed'])(
    'fails closed when the authoritative record is %s',
    async (state) => {
      const storage = owner();
      await storage.read();
      await storage.write(snapshot(1));
      const previous = disk.rows.get('legacy');
      const replacement =
        state === 'missing'
          ? undefined
          : state === 'invalid'
            ? { version: 99 }
            : { ...previous, snapshot: snapshot(2) };
      disk.rows.set('legacy', replacement);
      await expect(storage.read()).rejects.toThrow();
      await expect(storage.write(snapshot(3))).rejects.toThrow();
      expect(disk.rows.get('legacy')).toEqual(replacement);
    }
  );

  it('never falls back to an in-memory or legacy snapshot when storage is unavailable', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(1));
    const storage = owner();
    await storage.read();
    disk.failRead = true;
    await expect(storage.read()).rejects.toThrow('Read denied');
    await expect(storage.write(snapshot(2))).rejects.toThrow('Read denied');
    await expect(protectedDraftPageIds()).rejects.toThrow('Read denied');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1));
  });

  it('can retry a rejected database open without acquiring a write baseline from memory', async () => {
    const storage = owner();
    disk.failOpen = true;
    await expect(storage.read()).rejects.toThrow('Storage unavailable');
    await expect(storage.write(snapshot())).rejects.toThrow('Recover the current draft');
    disk.failOpen = false;
    await expect(storage.read()).resolves.toBeNull();
    expect(disk.opens).toHaveLength(2);
  });
});

describe('beta browser draft migration and artwork protection', () => {
  it('imports validated legacy bytes once and retains them as an unchanged backup', async () => {
    const original = snapshot(0, 'flower');
    backups.set(LEGACY_DRAFT_KEYS.legacy, original);
    const draftStorage = owner();
    await expect(draftStorage.read()).resolves.toBe(original);
    await draftStorage.write(snapshot(1));
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe(original);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalledWith(LEGACY_DRAFT_KEYS.legacy, expect.anything());
    expect(navigator.storage.persist).not.toHaveBeenCalled();
  });

  it('keeps IDB authoritative when an older version tab changes the retained localStorage backup', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, 'flower'));
    const storage = owner();
    await storage.read();
    await storage.write(snapshot(1));
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(2, 'flower'));
    await expect(owner().read()).resolves.toBe(snapshot(1));
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe(snapshot(2, 'flower'));
  });

  it('refuses to resurrect retained backup bytes after the authoritative record disappears', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, 'flower'));
    const storage = owner();
    await storage.read();
    await storage.write(snapshot(1));
    disk.rows.clear();
    await expect(owner().read()).rejects.toThrow('could not be checked');
    await expect(protectedDraftPageIds()).rejects.toThrow('could not be checked');
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe(snapshot(0, 'flower'));
    expect(disk.rows.size).toBe(0);
  });

  it('keeps a failed initial migration visible and preserves its backup', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, 'flower'));
    const storage = owner();
    disk.nextWriteOutcome = 'abort';
    await expect(storage.read()).rejects.toThrow('not confirmed');
    await expect(storage.read()).rejects.toThrow('could not be checked');
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe(snapshot(0, 'flower'));
    expect(disk.rows.size).toBe(0);
  });

  it('validates a legacy snapshot before claiming authority or importing it', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, '{invalid');
    await expect(owner().read()).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(disk.rows.size).toBe(0);
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe('{invalid');
  });

  it('does not import or fall back when the authority marker cannot be verified', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, 'flower'));
    storage.setItem.mockImplementation(() => {});
    const draftStorage = owner();
    await expect(draftStorage.read()).rejects.toThrow('could not be checked');
    await expect(draftStorage.write(snapshot(1))).rejects.toThrow('Recover the current draft');
    expect(disk.rows.size).toBe(0);
    expect(backups.get(LEGACY_DRAFT_KEYS.legacy)).toBe(snapshot(0, 'flower'));
  });

  it('rejects an invalid authoritative record without consulting a valid migration backup', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot());
    disk.rows.set('legacy', { version: 1, revision: 1, snapshot: snapshot() });
    await expect(owner().read()).rejects.toThrow('could not be checked');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(disk.puts).toEqual([]);
  });

  it('uses separate durable records and migration backups for legacy and recorded sessions', async () => {
    const recorded = encodeDrawingDraft(createDrawingSession('recorded').currentDrawing());
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, 'flower'));
    backups.set(LEGACY_DRAFT_KEYS.recorded, recorded);
    const legacy = owner();
    const modern = owner('recorded');
    await Promise.all([legacy.read(), modern.read()]);
    await legacy.write(snapshot(1, 'flower'));
    await expect(modern.read()).resolves.toBe(recorded);
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1, 'flower'));
    expect(disk.rows.get('recorded').snapshot).toBe(recorded);
    expect((await protectedDraftPageIds()).sort()).toEqual(['blank', 'flower']);
    expect(createDrawingSession().currentDrawing().version).toBe(6);
  });

  it('enumerates unmigrated protection snapshots without writing or claiming authority', async () => {
    backups.set(LEGACY_DRAFT_KEYS.legacy, snapshot(0, PAGE));
    await expect(protectedDraftPageIds()).resolves.toEqual([PAGE]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(disk.puts).toEqual([]);
    expect(artwork.admit).not.toHaveBeenCalled();
  });

  it('does not rebase a stale writer when removal reads protected pages', async () => {
    const { a, b } = await loadedPair();
    await a.write(snapshot(1, 'flower'));
    await expect(protectedDraftPageIds()).resolves.toEqual(['flower']);
    await expect(b.write(snapshot(2))).rejects.toThrow('Another tab changed');
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(1, 'flower'));
  });

  it('reads committed protection without waiting on a writer blocked by the artwork lock', async () => {
    const storage = owner();
    await storage.read();
    await storage.write(snapshot(0, 'flower'));
    const lock = deferred();
    artwork.admit.mockImplementation(async (_page, action) => {
      await lock.promise;
      return action();
    });
    let settled = false;
    const writing = storage.write(snapshot(0, PAGE)).then(() => (settled = true));
    await vi.waitFor(() => expect(artwork.admit).toHaveBeenCalledWith(PAGE, expect.any(Function)));
    await expect(protectedDraftPageIds()).resolves.toEqual(['flower']);
    expect(settled).toBe(false);
    lock.resolve();
    await writing;
    await expect(protectedDraftPageIds()).resolves.toEqual([PAGE]);
    expect(artwork.admit).toHaveBeenCalledOnce();
  });

  it('keeps the previous draft when artwork admission rejects before the CAS transaction', async () => {
    const storage = owner();
    await storage.read();
    await storage.write(snapshot(1));
    const previous = structuredClone(disk.rows.get('legacy'));
    artwork.admit.mockRejectedValue(new Error('Artwork unavailable'));
    await expect(storage.write(snapshot(0, PAGE))).rejects.toThrow('Artwork unavailable');
    expect(disk.rows.get('legacy')).toEqual(previous);
    await storage.write(snapshot(2));
    expect(disk.rows.get('legacy').snapshot).toBe(snapshot(2));
  });
});
