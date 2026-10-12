import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  listPictures,
  reopenPicture,
  savedColoringPageIds,
  savePicture,
} from '../../experiments/native-architecture/src/platform/drawingFiles.web.ts';

const library = vi.hoisted(() => ({ withSavedArtwork: vi.fn(), openPage: vi.fn() }));
vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: library,
}));

const PAGE = `offline:dinosaur:brachiosaurus:${'a'.repeat(64)}`;
let storage;
function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
beforeEach(() => {
  storage = {};
  Object.defineProperties(storage, {
    getItem: { value: vi.fn((key) => storage[key] ?? null) },
    setItem: { value: vi.fn((key, value) => (storage[key] = value)) },
  });
  vi.stubGlobal('localStorage', storage);
  library.withSavedArtwork.mockReset().mockImplementation((_page, action) => action());
  library.openPage.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('browser editable picture ownership', () => {
  it('round trips an editable picture and leaves unrelated browser data alone', async () => {
    storage.unrelated = 'preserved';
    const picture = await savePicture(emptyDrawing());
    expect(await reopenPicture(picture.id)).toEqual(emptyDrawing());
    expect(listPictures()).toEqual([picture]);
    expect(storage.unrelated).toBe('preserved');
    expect(library.withSavedArtwork).not.toHaveBeenCalled();
    expect(library.openPage).not.toHaveBeenCalled();
  });

  it('waits for offline artwork admission before committing an editable save', async () => {
    const gate = deferred();
    library.withSavedArtwork.mockImplementation(async (_page, action) => {
      await gate.promise;
      return action();
    });
    const saving = savePicture(emptyDrawing(0, PAGE));
    await vi.waitFor(() => expect(library.withSavedArtwork).toHaveBeenCalled());
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(listPictures()).toEqual([]);
    gate.resolve();
    const picture = await saving;
    expect(await savedColoringPageIds()).toEqual([PAGE]);
    expect(listPictures()).toEqual([picture]);
  });

  it('keeps existing pictures when artwork cannot be protected for a new save', async () => {
    const existing = await savePicture(emptyDrawing());
    library.withSavedArtwork.mockRejectedValue(new Error('artwork damaged'));
    await expect(savePicture(emptyDrawing(0, PAGE))).rejects.toThrow('artwork damaged');
    expect(listPictures()).toEqual([existing]);
    expect(await reopenPicture(existing.id)).toEqual(emptyDrawing());
  });

  it('prepares saved offline artwork before returning a reopened drawing', async () => {
    const picture = await savePicture(emptyDrawing(0, PAGE));
    const gate = deferred();
    library.openPage.mockReturnValue(gate.promise);
    let settled = false;
    const opening = reopenPicture(picture.id).then((drawing) => {
      settled = true;
      return drawing;
    });
    await vi.waitFor(() => expect(library.openPage).toHaveBeenCalledWith(PAGE));
    expect(settled).toBe(false);
    gate.resolve();
    expect(await opening).toEqual(emptyDrawing(0, PAGE));
  });

  it('enumerates protected pages without reopening artwork inside the removal lease', async () => {
    await savePicture(emptyDrawing(0, PAGE));
    library.openPage.mockRejectedValue(new Error('removal owns the artwork queue'));
    expect(await savedColoringPageIds()).toEqual([PAGE]);
    expect(library.openPage).not.toHaveBeenCalled();
  });

  it('refuses removal enumeration when any saved picture is corrupt', async () => {
    const picture = await savePicture(emptyDrawing(0, PAGE));
    storage[`splotch-picture:${picture.id}`] = '{';
    await expect(savedColoringPageIds()).rejects.toMatchObject({
      code: 'corrupt',
      message: 'A saved picture could not be checked. Your coloring books were kept.',
    });
    expect(storage[`splotch-picture:${picture.id}`]).toBe('{');
  });

  it('surfaces browser quota failure without reporting a new saved picture', async () => {
    const existing = await savePicture(emptyDrawing());
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    await expect(savePicture(emptyDrawing())).rejects.toThrow('quota exceeded');
    expect(listPictures()).toEqual([existing]);
  });
});
