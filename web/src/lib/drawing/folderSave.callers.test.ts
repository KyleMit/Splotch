import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storage';

const boundary = vi.hoisted(() => ({
  handle: null as unknown,
  picture: null as Blob | null,
  exports: [] as Array<ReturnType<typeof Promise.withResolvers<Blob | null>>>,
  download: vi.fn(),
}));

vi.mock('$lib/idb', () => ({
  idbKvStore: () => ({ get: async () => boundary.handle }),
  requestPersistentStorage: vi.fn(),
}));
vi.mock('$lib/platform', () => ({ isNative: () => false, getPlatform: () => 'web' }));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: { saveOnDeleteEnabled: true } }));
vi.mock('$lib/state/saveFailure.svelte', () => ({ reportSaveFailure: vi.fn() }));
vi.mock('./engine', () => ({
  isCanvasEmpty: () => boundary.picture === null,
  exportCanvasBlob: () => {
    const exportResult = Promise.withResolvers<Blob | null>();
    boundary.exports.push(exportResult);
    return exportResult.promise;
  },
}));
vi.mock('./polaroidAnimation', () => ({ createPolaroidPreviewRequest: () => null }));
vi.mock('./screenshotFeedback', () => ({
  playScreenshotFeedback: vi.fn(),
  playScreenshotSuppressedFeedback: vi.fn(),
}));
vi.mock('$lib/savedFile', async (importActual) => ({
  ...(await importActual<typeof import('$lib/savedFile')>()),
  triggerDownload: boundary.download,
}));

type SaveOperation = 'lookup' | 'create' | 'write' | 'close';

function recordingFolder() {
  const files = new Map<string, Blob>();
  const createdNames: string[] = [];
  let failingOperation: SaveOperation | null = null;
  function failAt(operation: SaveOperation) {
    if (failingOperation !== operation) return;
    failingOperation = null;
    throw new DOMException('save interrupted', 'AbortError');
  }
  const handle = {
    name: 'Pictures',
    queryPermission: vi.fn(async () => 'granted'),
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      failAt(options?.create ? 'create' : 'lookup');
      if (!options?.create && !files.has(name)) throw new DOMException('missing', 'NotFoundError');
      if (options?.create) createdNames.push(name);
      files.set(name, files.get(name) ?? new Blob());
      return {
        createWritable: vi.fn(async () => {
          let payload = new Blob();
          return {
            write: async (picture: Blob) => {
              failAt('write');
              payload = picture;
            },
            close: async () => {
              failAt('close');
              files.set(name, payload);
            },
          };
        }),
      };
    }),
  };
  return {
    handle,
    files,
    createdNames,
    failNext: (operation: SaveOperation) => {
      failingOperation = operation;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  boundary.exports = [];
  boundary.picture = null;
  boundary.handle = null;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T01:00:00Z'));
  Object.defineProperty(window, 'showDirectoryPicker', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.restoreAllMocks();
});

describe('concurrent save callers', () => {
  it.each(['screenshot before clear', 'draw clear draw clear'] as const)(
    'preserves both completed exports through %s',
    async (sequence) => {
      const folder = recordingFolder();
      boundary.handle = folder.handle;
      localStorage.setItem(STORAGE_KEYS.saveFolderChosen, 'true');
      const { saveDrawingIfEnabled } = await import('./saveOnDelete');
      const { saveScreenshot } = await import('./screenshot');
      const pictures = [
        new Blob(['first complete drawing']),
        new Blob(['second complete drawing']),
      ];
      boundary.picture = pictures[0];
      const first =
        sequence === 'screenshot before clear' ? saveScreenshot() : saveDrawingIfEnabled();
      boundary.picture = null;
      boundary.picture = pictures[1];
      const second = saveDrawingIfEnabled();
      boundary.picture = null;
      vi.setSystemTime(new Date('2026-10-03T01:00:10Z'));
      boundary.exports[0].resolve(pictures[0]);
      boundary.exports[1].resolve(pictures[1]);
      await Promise.all([first, second]);

      expect(boundary.exports).toHaveLength(2);
      expect({
        distinctNames: new Set(folder.createdNames).size,
        payloads: await Promise.all([...folder.files.values()].map((picture) => picture.text())),
      }).toEqual({
        distinctNames: 2,
        payloads: ['first complete drawing', 'second complete drawing'],
      });
      expect(folder.createdNames[0]).toMatch(/_\d{2}-\d{2}-10\.png$/);
      expect(boundary.download).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['lookup', false],
    ['create', false],
    ['write', true],
    ['close', true],
  ] as const)('allows the held-picture retry after %s failure', async (operation, leavesFile) => {
    const folder = recordingFolder();
    boundary.handle = folder.handle;
    localStorage.setItem(STORAGE_KEYS.saveFolderChosen, 'true');
    const { saveImageBlob, retryImageSave } = await import('./imageSave');
    const picture = new Blob(['complete held picture'], { type: 'image/png' });
    folder.failNext(operation);

    expect(await saveImageBlob(picture, 'splotch')).toEqual({ status: 'downloads' });
    expect(await retryImageSave(picture, 'splotch')).toEqual({
      status: 'chosenFolder',
      folderName: 'Pictures',
    });
    expect(folder.createdNames).toHaveLength(leavesFile ? 2 : 1);
    expect(folder.createdNames.at(-1)?.includes(' (1)')).toBe(leavesFile);
    expect(await Promise.all([...folder.files.values()].map((saved) => saved.text()))).toEqual(
      leavesFile ? ['', 'complete held picture'] : ['complete held picture']
    );
    expect(boundary.download).toHaveBeenCalledOnce();
  });
});
