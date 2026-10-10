import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  listPictures,
  reopenPicture,
  savePicture,
} from '../../experiments/native-architecture/src/platform/drawingFiles.ts';

const filesystem = vi.hoisted(() => ({
  contents: new Map(),
  created: [],
  deleted: [],
  writeError: null,
  readError: null,
  readbackMismatch: false,
  deleteError: null,
  beforeMove: vi.fn(),
  afterMove: vi.fn(),
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
      filesystem.created.push(this.uri);
    }

    write(contents) {
      if (filesystem.writeError) throw filesystem.writeError;
      filesystem.contents.set(this.uri, contents);
    }

    async text() {
      if (filesystem.readError) throw filesystem.readError;
      if (filesystem.readbackMismatch) return 'incomplete';
      return filesystem.contents.get(this.uri);
    }

    /** @returns {ReturnType<import('expo-file-system').File['move']>} */
    async move(destination) {
      await filesystem.beforeMove(this.uri, destination.uri);
      const contents = filesystem.contents.get(this.uri);
      filesystem.contents.delete(this.uri);
      filesystem.contents.set(destination.uri, contents);
      this.uri = destination.uri;
      await filesystem.afterMove();
    }

    delete() {
      filesystem.deleted.push(this.uri);
      if (filesystem.deleteError) throw filesystem.deleteError;
      filesystem.contents.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { document: 'document' } };
});
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-sharing', () => ({}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  filesystem.contents.clear();
  filesystem.created.length = 0;
  filesystem.deleted.length = 0;
  filesystem.writeError = null;
  filesystem.readError = null;
  filesystem.readbackMismatch = false;
  filesystem.deleteError = null;
  filesystem.beforeMove.mockReset();
  filesystem.afterMove.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('native picture save commit', () => {
  it('saves and reopens independent actual widths through the verified file commit', async () => {
    const drawing = {
      ...emptyDrawing(3, 'flower'),
      strokes: [
        { ...strokeStyle('crayon', 'Blue', emptyDrawing(3), 'thin'), points: [{ x: 200, y: 300 }] },
        { ...strokeStyle('magic', 'Blue', emptyDrawing(3), 'thick'), points: [{ x: 300, y: 300 }] },
        {
          ...strokeStyle('eraser', 'Blue', emptyDrawing(3), 'thick'),
          points: [{ x: 200, y: 300 }],
        },
      ],
    };
    const saved = await savePicture(drawing);
    const reopened = await reopenPicture(saved.id);
    expect(reopened).toEqual(drawing);
    expect(reopened.strokes.map(({ width }) => width)).toEqual([17, 60, 88]);
    const stored = JSON.parse(
      filesystem.contents.get(`document/splotch-pictures/${saved.id}.json`)
    );
    expect(stored.version).toBe(5);
    expect(stored.strokes.map(({ width }) => width)).toEqual([17, 60, 88]);
  });

  it('keeps save pending until the asynchronous move commits the reopened picture', async () => {
    const gate = deferred();
    const entered = deferred();
    filesystem.beforeMove.mockImplementation(() => {
      entered.resolve();
      return gate.promise;
    });
    let settled = false;
    const saving = savePicture(emptyDrawing()).then((picture) => {
      settled = true;
      return picture;
    });
    try {
      await entered.promise;
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(listPictures()).toEqual([]);
    } finally {
      gate.resolve();
    }
    const picture = await saving;
    expect(await reopenPicture(picture.id)).toEqual(emptyDrawing());
    expect(listPictures().map((saved) => saved.id)).toEqual([picture.id]);
    expect([...filesystem.contents.keys()]).toEqual([
      `document/splotch-pictures/${picture.id}.json`,
    ]);
    expect(filesystem.deleted).toEqual([]);
  });

  it('reports a late move rejection and removes only its original pending file', async () => {
    const gate = deferred();
    const entered = deferred();
    const error = new Error('Move refused.');
    filesystem.beforeMove.mockImplementation(() => {
      entered.resolve();
      return gate.promise;
    });
    const saving = savePicture(emptyDrawing());
    const outcome = saving.catch((failure) => failure);
    await entered.promise;
    gate.reject(error);
    expect(await outcome).toBe(error);
    expect(filesystem.deleted).toEqual(filesystem.created);
    expect([...filesystem.contents.keys()]).toEqual([]);
    expect(listPictures()).toEqual([]);
  });

  it.each(['write', 'read', 'readback', 'move'])(
    'cleans its owned pending file after %s failure',
    async (stage) => {
      const committed = 'document/splotch-pictures/picture-1-existing.json';
      const concurrent = 'document/splotch-pictures/picture-2-concurrent.pending';
      filesystem.contents.set(committed, JSON.stringify(emptyDrawing()));
      filesystem.contents.set(concurrent, 'another save');
      const error = new Error(`${stage} refused.`);
      const failures = {
        write: () => (filesystem.writeError = error),
        read: () => (filesystem.readError = error),
        readback: () => (filesystem.readbackMismatch = true),
        move: () => filesystem.beforeMove.mockRejectedValue(error),
      };
      failures[stage]();
      const expected =
        stage === 'readback'
          ? 'The picture could not be saved completely. Please try again.'
          : error.message;
      await expect(savePicture(emptyDrawing())).rejects.toThrow(expected);
      expect(filesystem.deleted).toEqual(filesystem.created);
      expect([...filesystem.contents.keys()]).toEqual([committed, concurrent]);
    }
  );

  it('preserves the original failure when pending cleanup also fails', async () => {
    const error = new Error('Original write refused.');
    filesystem.writeError = error;
    filesystem.deleteError = new Error('Cleanup refused.');
    await expect(savePicture(emptyDrawing())).rejects.toBe(error);
    expect(filesystem.deleted).toEqual(filesystem.created);
    expect([...filesystem.contents.keys()]).toEqual(filesystem.created);
  });

  it('never deletes a published JSON if a move changes the File URI before rejecting', async () => {
    const error = new Error('Move completion refused.');
    filesystem.afterMove.mockRejectedValue(error);
    await expect(savePicture(emptyDrawing())).rejects.toBe(error);
    const published = filesystem.created[0].replace(/\.pending$/, '.json');
    expect([...filesystem.contents.keys()]).toEqual([published]);
    expect(filesystem.contents.get(published)).toBe(JSON.stringify(emptyDrawing()));
    expect(filesystem.deleted).toEqual([]);
  });
});
