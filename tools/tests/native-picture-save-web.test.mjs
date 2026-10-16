// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pictureSave } from '../../experiments/native-architecture/src/platform/pictureSave.web.ts';
import {
  AI_IMAGE_BASENAME,
  DRAWING_BASENAME,
  pictureFilename,
} from '../../experiments/native-architecture/src/export/pictureFilename.ts';
import { keepAiPicture } from '../../experiments/native-architecture/src/ai/keepAiPicture.ts';
import {
  capturePicture,
  savePicture,
} from '../../experiments/native-architecture/src/keepPicture.ts';
import { saveFailureCopy as nativeSaveFailureCopy } from '../../experiments/native-architecture/src/export/pictureSave.ts';
import {
  AI_IMAGE_BASENAME as SHIPPING_AI_BASENAME,
  DRAWING_BASENAME as SHIPPING_BASENAME,
} from '../../web/src/lib/saveNaming.ts';
import { timestamp } from '../../web/src/lib/savedFile.ts';
import { saveFailureCopy } from '../../web/src/lib/drawing/saveFailureCopy.ts';
import { folderSave } from '../../experiments/native-architecture/src/platform/folderSave.web.ts';
import { browserFolderSave } from '../../experiments/native-architecture/src/platform/browserFolderSaveLoader.ts';

const folderRecords = vi.hoisted(() => new Map());
vi.mock('../../web/src/lib/idbDatabase.ts', () => ({
  openDatabase: async () => ({
    get: async (_store, key) => folderRecords.get(key),
    put: async (_store, value, key) => {
      folderRecords.set(key, value);
    },
    delete: async (_store, key) => {
      folderRecords.delete(key);
    },
    closed: new Promise(() => {}),
  }),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// The web export resolves platform/pictureSave to its .web sibling.
vi.mock(
  '../../experiments/native-architecture/src/platform/pictureSave.ts',
  () => import('../../experiments/native-architecture/src/platform/pictureSave.web.ts')
);
vi.mock(
  '../../experiments/native-architecture/src/platform/aiPictureBase64.ts',
  () => import('../../experiments/native-architecture/src/platform/aiPictureBase64.web.ts')
);

const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG = btoa(String.fromCharCode(...PNG_BYTES));
const SAVED_AT = new Date(2026, 9, 13, 9, 5, 7);

let downloads;
let blobs;
let revoked;
const originalPicker = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker');

beforeEach(async () => {
  localStorage.clear();
  folderRecords.clear();
  Object.defineProperty(window, 'showDirectoryPicker', {
    configurable: true,
    value: vi.fn(async () => {
      throw new DOMException('Cancelled', 'AbortError');
    }),
  });
  await folderSave.clearSaveFolder();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVED_AT);
  downloads = [];
  blobs = [];
  revoked = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob);
    return `blob:picture-${blobs.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.push({
      href: this.href,
      download: this.download,
      attached: document.body.contains(this),
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalPicker) Object.defineProperty(window, 'showDirectoryPicker', originalPicker);
  else delete window.showDirectoryPicker;
});

function directory(name = 'Drawings') {
  const files = new Map();
  const handle = {
    name,
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
    getFileHandle: vi.fn(async (filename, options) => {
      if (!options?.create && !files.has(filename))
        throw new DOMException('Missing', 'NotFoundError');
      if (options?.create && !files.has(filename)) files.set(filename, null);
      return {
        createWritable: async () => ({
          write: async (blob) => {
            files.set(filename, blob);
          },
          close: async () => {},
        }),
      };
    }),
  };
  return { handle, files };
}

function surface(png) {
  return {
    exportPng: vi.fn(async () => ({
      base64: png ?? null,
      ...(png ? { size: { width: 1, height: 1 } } : {}),
      isCurrent: () => true,
    })),
  };
}

describe('saving a picture on the web', () => {
  it('downloads without loading the optional folder module on an unsupported browser', async () => {
    delete window.showDirectoryPicker;
    const load = vi.spyOn(browserFolderSave, 'load');
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(load).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(1);
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
  });

  it('downloads the exact picture if the optional folder chunk cannot load', async () => {
    vi.spyOn(browserFolderSave, 'load').mockRejectedValueOnce(new Error('Chunk unavailable.'));
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(downloads).toHaveLength(1);
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
    expect(revoked).toEqual(['blob:picture-1']);
  });

  it('writes into the chosen shipping folder without opening the picker again or downloading', async () => {
    const { handle, files } = directory();
    window.showDirectoryPicker.mockResolvedValue(handle);
    expect(await folderSave.chooseSaveFolder()).toBe('Drawings');
    expect(await pictureSave.save(PNG)).toEqual({ status: 'chosenFolder', folderName: 'Drawings' });
    expect(window.showDirectoryPicker).toHaveBeenCalledExactlyOnceWith({
      mode: 'readwrite',
      startIn: 'pictures',
    });
    expect(downloads).toEqual([]);
    expect(blobs).toEqual([]);
    const blob = files.get('splotch-2026-10-13_09-05-07.png');
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(PNG_BYTES);
  });

  it('asks to renew folder permission for a deliberate save and falls back silently for an automatic save', async () => {
    const { handle, files } = directory();
    window.showDirectoryPicker.mockResolvedValue(handle);
    await folderSave.chooseSaveFolder();
    handle.requestPermission.mockClear();
    handle.queryPermission.mockResolvedValue('prompt');
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
    expect(await pictureSave.save(PNG, undefined, { allowPrompt: true })).toEqual({
      status: 'chosenFolder',
      folderName: 'Drawings',
    });
    expect(handle.requestPermission).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite' });
    expect(files.size).toBe(1);
  });

  it('reserves distinct same-second folder filenames and forgets a missing folder', async () => {
    const { handle, files } = directory();
    window.showDirectoryPicker.mockResolvedValue(handle);
    await folderSave.chooseSaveFolder();
    expect(await Promise.all([pictureSave.save(PNG), pictureSave.save(PNG)])).toEqual([
      { status: 'chosenFolder', folderName: 'Drawings' },
      { status: 'chosenFolder', folderName: 'Drawings' },
    ]);
    expect([...files.keys()]).toEqual([
      'splotch-2026-10-13_09-05-07.png',
      'splotch-2026-10-13_09-05-07 (1).png',
    ]);
    const cleared = vi.fn();
    folderSave.setSaveFolderClearedListener(cleared);
    handle.queryPermission.mockRejectedValue(
      new DOMException('Missing directory', 'NotFoundError')
    );
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(await folderSave.getSaveFolderName()).toBeNull();
    expect(cleared).toHaveBeenCalledOnce();
  });
  it('downloads the PNG under the shipping file name, then lets the object URL go', async () => {
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(downloads).toEqual([
      { href: 'blob:picture-1', download: 'splotch-2026-10-13_09-05-07.png', attached: true },
    ]);
    expect(blobs[0].type).toBe('image/png');
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
    expect(revoked).toEqual(['blob:picture-1']);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('names the file the way the shipping save does', () => {
    expect(DRAWING_BASENAME).toBe(SHIPPING_BASENAME);
    expect(pictureFilename(new Date())).toBe(`${SHIPPING_BASENAME}-${timestamp()}.png`);
  });

  it('downloads an AI picture in its own format under the shipping AI file name', async () => {
    expect(AI_IMAGE_BASENAME).toBe(SHIPPING_AI_BASENAME);
    const format = { baseName: AI_IMAGE_BASENAME, mime: 'image/webp' };
    expect(
      await keepAiPicture({ uri: `data:image/webp;base64,${PNG}`, mime: 'image/webp' })
    ).toEqual({
      outcome: 'downloads',
      base64: PNG,
      format,
    });
    expect(downloads).toEqual([
      { href: 'blob:picture-1', download: 'splotch-ai-2026-10-13_09-05-07.webp', attached: true },
    ]);
    expect(blobs[0].type).toBe('image/webp');
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
  });

  it('reports an AI picture it cannot read as a failed save with nothing to retry', async () => {
    const kept = await keepAiPicture({ uri: 'blob:elsewhere', mime: 'image/png' });
    expect(kept).toEqual({
      outcome: 'failed',
      base64: null,
      format: { baseName: AI_IMAGE_BASENAME, mime: 'image/png' },
    });
    expect(downloads).toEqual([]);
  });

  it('keeps a picture by downloading it, with the PNG it captured', async () => {
    const paper = surface(PNG);
    const captured = await capturePicture({ strokes: [] }, paper);
    expect(captured.base64).toBe(PNG);
    expect(captured.size).toEqual({ width: 1, height: 1 });
    expect(captured.isCurrent()).toBe(true);
    expect(await savePicture(captured.base64)).toBe('downloads');
    expect(downloads).toHaveLength(1);
  });

  it('holds the PNG of a download that could not start, for Try again', async () => {
    URL.createObjectURL.mockImplementation(() => {
      throw new Error('blocked');
    });
    const captured = await capturePicture({ strokes: [] }, surface(PNG));
    expect(captured.base64).toBe(PNG);
    expect(await savePicture(captured.base64)).toBe('failed');
    expect(downloads).toEqual([]);
  });

  it('reports a capture that produced nothing as a failed save with no picture to retry', async () => {
    const failed = await capturePicture({ strokes: [] }, surface(undefined));
    expect(failed.base64).toBeNull();
    expect(failed.isCurrent()).toBe(true);
    const thrown = { exportPng: vi.fn(async () => Promise.reject(new Error('lost'))) };
    expect(await capturePicture({ strokes: [] }, thrown)).toBeNull();
    expect(downloads).toEqual([]);
  });

  it('words a failed web save in the shipping banner copy, with no Settings to send a parent to', () => {
    expect(saveFailureCopy('denied', 1, 'web')).toEqual(nativeSaveFailureCopy('denied', 1, 'web'));
    expect(nativeSaveFailureCopy('denied', 1, 'web').detail).not.toContain('Settings');
  });
});

it.each([PNG, null])('keeps producer currentness with a saved capture of %s', async (base64) => {
  let current = true;
  const outcome = base64
    ? { base64, size: { width: 1, height: 1 }, isCurrent: () => current }
    : { base64: null, isCurrent: () => current };
  const paper = { exportPng: vi.fn(async () => outcome) };
  const captured = await capturePicture({ strokes: [] }, paper);
  expect(captured).toBe(outcome);
  expect(captured.isCurrent()).toBe(true);
  current = false;
  expect(captured.isCurrent()).toBe(false);
});
