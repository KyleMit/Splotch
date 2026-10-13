import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import { createDrawingDraft } from '../../experiments/native-architecture/src/product/createDrawingDraft.ts';
import {
  decodeDrawingDraft,
  encodeDrawingDraft,
} from '../../experiments/native-architecture/src/product/drawingDraft.ts';
import {
  drawingDraftStorage,
  drawingDraftStorageFor,
  protectedDraftPageIds,
} from '../../experiments/native-architecture/src/platform/drawingDraft.ts';
import {
  addStroke,
  addRecordedCohort,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { canonicalPaper } from './native-paper-fixtures.mjs';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import { readDrawingBackend } from '../../experiments/native-architecture/src/product/drawingBackend.ts';

const filesystem = vi.hoisted(() => ({
  contents: new Map(),
  writeError: null,
  readError: null,
  artworkError: null,
  artwork: vi.fn(),
}));

vi.mock('expo-file-system', () => {
  class Directory {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {}
    list() {
      return [...filesystem.contents.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new File(uri));
    }
  }
  class File {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return filesystem.contents.has(this.uri);
    }
    get size() {
      return filesystem.contents.get(this.uri)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('File already exists.');
      filesystem.contents.set(this.uri, '');
    }
    write(snapshot) {
      if (filesystem.writeError) throw filesystem.writeError;
      filesystem.contents.set(this.uri, snapshot);
    }
    async text() {
      if (filesystem.readError) throw filesystem.readError;
      return filesystem.contents.get(this.uri);
    }
    async move(destination) {
      const snapshot = filesystem.contents.get(this.uri);
      filesystem.contents.delete(this.uri);
      filesystem.contents.set(destination.uri, snapshot);
      this.uri = destination.uri;
    }
    delete() {
      filesystem.contents.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: 'document' } };
});

vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: {
    async withSavedArtwork(page, action) {
      filesystem.artwork(page);
      if (filesystem.artworkError) throw filesystem.artworkError;
      return action();
    },
  },
}));

const STROKE = { brush: 'pen', color: 'Purple', width: 8, points: [{ x: 10, y: 20 }] };
const drafts = [];
function coordinator(session, storage = drawingDraftStorage, prepare = async () => {}) {
  const draft = createDrawingDraft(session, storage, prepare);
  drafts.push(draft);
  return draft;
}
function draw(session) {
  session.setHistory((history) => addStroke(history, STROKE, canonicalPaper()));
}
function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

beforeEach(() => {
  filesystem.contents.clear();
  filesystem.writeError = null;
  filesystem.readError = null;
  filesystem.artworkError = null;
  filesystem.artwork.mockClear();
});
afterEach(() => {
  for (const draft of drafts.splice(0)) draft.dispose();
});

describe('current draft recovery', () => {
  it('requires an explicit recorded mode and preserves the no-argument schema 6 session', () => {
    expect(createDrawingSession().currentDrawing().version).toBe(6);
    expect(createDrawingSession('recorded').currentDrawing().version).toBe(7);
    expect(readDrawingBackend(undefined)).toBe('legacy');
    expect(readDrawingBackend('legacy')).toBe('legacy');
    expect(readDrawingBackend('recorded')).toBe('recorded');
    expect(() => readDrawingBackend('')).toThrow('legacy or recorded');
    expect(() => readDrawingBackend('auto')).toThrow('legacy or recorded');
  });

  it('recovers recorded input and allocation exactly without replacing the legacy draft', async () => {
    const legacy = encodeDrawingDraft(emptyDrawing(0, 'flower'));
    await drawingDraftStorage.write(legacy);
    const storage = drawingDraftStorageFor('recorded');
    const first = createDrawingSession('recorded');
    const draft = coordinator(first, storage);
    await draft.start();
    const cohort = createRecordedContactCohort7(canonicalPaper(), 'per-frame', 1);
    cohort.start('one', { brush: 'crayon', color: 'Purple', width: 14 }, { x: 10, y: 20 });
    cohort.move('one', [{ x: 30, y: 40 }]);
    cohort.drain();
    const base = first.currentDrawing();
    const completed = cohort.end('one');
    first.setHistory((history) => addRecordedCohort(history, base, completed));
    await draft.retry();
    const second = createDrawingSession('recorded');
    await coordinator(second, storage).start();
    expect(second.currentDrawing()).toEqual(first.currentDrawing());
    expect(second.currentDrawing().commands).toHaveLength(1);
    expect(second.getSnapshot().allocationCursor7).toBe(first.getSnapshot().allocationCursor7);
    expect(second.getSnapshot().undo).toEqual([]);
    expect(await drawingDraftStorage.read()).toBe(legacy);
    expect((await protectedDraftPageIds()).sort()).toEqual(['blank', 'flower']);
  });

  it('recovers the validated current drawing into a fresh app without restoring Undo', async () => {
    const first = createDrawingSession();
    const saving = coordinator(first);
    await saving.start();
    draw(first);
    await saving.retry();
    saving.dispose();
    const second = createDrawingSession();
    await coordinator(second).start();
    expect(second.currentDrawing()).toEqual(first.currentDrawing());
    expect(second.getSnapshot().undo).toEqual([]);
    expect(
      [...filesystem.contents.keys()].every((path) => path.includes('splotch-current-draft-v1'))
    ).toBe(true);
  });

  it('keeps new ink drawn while an older current draft is loading', async () => {
    const read = deferred();
    let stored = encodeDrawingDraft(emptyDrawing(0, 'flower'));
    const session = createDrawingSession();
    const draft = coordinator(session, {
      read: () => read.promise,
      write: async (snapshot) => {
        stored = snapshot;
      },
    });
    const loading = draft.start();
    draw(session);
    read.resolve(stored);
    await loading;
    expect(session.currentDrawing().pageId).toBe('blank');
    expect(session.currentDrawing().strokes).toHaveLength(1);
    expect(decodeDrawingDraft(stored)).toEqual(session.currentDrawing());
  });

  it('serializes an older slow write ahead of the newer current picture', async () => {
    const gate = deferred();
    const writes = [];
    const session = createDrawingSession();
    const draft = coordinator(session, {
      read: async () => null,
      async write(snapshot) {
        writes.push(snapshot);
        if (writes.length === 1) await gate.promise;
      },
    });
    await draft.start();
    draw(session);
    draw(session);
    gate.resolve();
    await draft.retry();
    expect(decodeDrawingDraft(writes.at(-1))).toEqual(session.currentDrawing());
    expect(decodeDrawingDraft(writes.at(-1)).strokes).toHaveLength(2);
  });

  it('keeps the last committed draft after a failed native write and retries the current picture', async () => {
    const original = encodeDrawingDraft(emptyDrawing(0, 'flower'));
    await drawingDraftStorage.write(original);
    const session = createDrawingSession();
    const draft = coordinator(session);
    await draft.start();
    filesystem.writeError = new Error('Disk full');
    draw(session);
    await draft.retry();
    expect(draft.getSnapshot().status).toBe('failed');
    expect(draft.getSnapshot().message).toContain('could not be saved');
    expect(await drawingDraftStorage.read()).toBe(original);
    filesystem.writeError = null;
    await draft.retry();
    expect(decodeDrawingDraft(await drawingDraftStorage.read())).toEqual(session.currentDrawing());
    expect(draft.getSnapshot().status).toBe('ready');
  });

  it('refuses to replace an unreadable draft with newly drawn ink until recovery is retried', async () => {
    const write = vi.fn();
    const read = vi.fn().mockRejectedValueOnce(new Error('Read denied')).mockResolvedValue(null);
    const session = createDrawingSession();
    const draft = coordinator(session, { read, write });
    await draft.start();
    draw(session);
    expect(write).not.toHaveBeenCalled();
    expect(draft.getSnapshot().status).toBe('failed');
    await draft.retry();
    expect(write).toHaveBeenCalledOnce();
    expect(decodeDrawingDraft(write.mock.calls[0][0])).toEqual(session.currentDrawing());
  });

  it('protects the stored offline page and rejects an artwork admission failure before publication', async () => {
    const page = `offline:dinosaur:brachiosaurus:${'a'.repeat(64)}`;
    await drawingDraftStorage.write(encodeDrawingDraft(emptyDrawing(0, page)));
    expect(filesystem.artwork).toHaveBeenCalledWith(page);
    expect(await protectedDraftPageIds()).toEqual([page]);
    filesystem.artworkError = new Error('Artwork unavailable');
    await expect(
      drawingDraftStorage.write(encodeDrawingDraft(emptyDrawing(1, page)))
    ).rejects.toThrow('Artwork unavailable');
    expect(decodeDrawingDraft(await drawingDraftStorage.read()).rainbow).toBe(0);
  });

  it('fails closed when the stored page protection record is corrupt or unreadable', async () => {
    await drawingDraftStorage.write(encodeDrawingDraft(emptyDrawing()));
    filesystem.readError = new Error('Read denied');
    await expect(protectedDraftPageIds()).rejects.toThrow('Read denied');
    filesystem.readError = null;
    const latest = [...filesystem.contents.keys()].find((path) => path.endsWith('.json'));
    filesystem.contents.set(latest, '{"version":1,"drawing":{"version":99}}');
    await expect(protectedDraftPageIds()).rejects.toThrow();
  });

  it('keeps the stored draft when its required artwork cannot be restored', async () => {
    const original = encodeDrawingDraft(emptyDrawing(0, 'flower'));
    await drawingDraftStorage.write(original);
    const session = createDrawingSession();
    const draft = coordinator(session, drawingDraftStorage, async () => {
      throw new Error('Artwork unavailable');
    });
    await draft.start();
    expect(session.getSnapshot()).toEqual(createHistory());
    expect(draft.getSnapshot().status).toBe('failed');
    expect(await drawingDraftStorage.read()).toBe(original);
  });
});
