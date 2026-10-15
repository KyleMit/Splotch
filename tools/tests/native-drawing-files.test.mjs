import { unsavedPictureStore } from '../../experiments/native-architecture/src/platform/unsavedPictures.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('durable unsaved pictures on native', () => {
  const held = [{ pngBase64: 'exact-captured-png', outcome: 'denied' }];
  it('keeps exact bytes and formats through a verified commit and clears without resurrecting older records', async () => {
    const pictures = [
      ...held,
      {
        pngBase64: 'exact-ai-jpeg',
        outcome: 'failed',
        format: { baseName: 'splotch-ai', mime: 'image/jpeg' },
      },
    ];
    await unsavedPictureStore.write(pictures);
    await expect(unsavedPictureStore.read()).resolves.toEqual(pictures);
    await unsavedPictureStore.write(null);
    await expect(unsavedPictureStore.read()).resolves.toBeNull();
  });
  it('leaves the last committed pictures readable after an interrupted write', async () => {
    await unsavedPictureStore.write(held);
    filesystem.writeError = new Error('Disk full.');
    await expect(unsavedPictureStore.write(null)).rejects.toThrow('Disk full.');
    filesystem.writeError = null;
    await expect(unsavedPictureStore.read()).resolves.toEqual(held);
  });
  it('refuses an incomplete staged write without replacing committed pictures', async () => {
    await unsavedPictureStore.write(held);
    filesystem.readbackMismatch = true;
    await expect(unsavedPictureStore.write(null)).rejects.toThrow('incomplete');
    filesystem.readbackMismatch = false;
    await expect(unsavedPictureStore.read()).resolves.toEqual(held);
  });
});
