import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import type { ColoringPackStore, InstalledColoringPack } from './store';

const mocks = vi.hoisted(() => ({
  installed: vi.fn(),
  install: vi.fn(),
  remove: vi.fn(),
  usage: vi.fn(),
}));

vi.mock('$lib/state/coloringBook.svelte', () => ({ clearOverlay: vi.fn() }));
vi.mock('$lib/state/settings.svelte', () => ({
  settings: { coloringPacksAllowMetered: false },
}));
vi.mock('./assetResolver', () => ({
  clearLocalColoringBookRoots: vi.fn(),
  setLocalColoringBookRoot: vi.fn(),
}));
vi.mock('./nativeStore', () => ({
  createNativeColoringPackStore: (): ColoringPackStore => ({
    installed: mocks.installed,
    install: mocks.install,
    remove: mocks.remove,
    usage: mocks.usage,
  }),
}));

import { createColoringPackDownloader } from './manager';
import { coloringPackState, resetDownloadedColoringBooks } from '$lib/state/coloringPacks.svelte';

const manifest = {
  formatVersion: 2,
  appVersion: '1.0.0-test',
  starterBookId: 'farm',
  books: ['farm', 'dinosaur', 'space'].map((id) => ({
    id,
    variants: Object.fromEntries(
      ['compact', 'full'].map((resolution) => {
        const path = `/coloring/${id}/cover.webp`;
        return [
          resolution,
          {
            bytes: 1,
            files: [
              {
                path,
                downloadPath:
                  resolution === 'compact' ? `/coloring/max-240px/${id}/cover.webp` : path,
                bytes: 1,
                sha256: 'a'.repeat(64),
              },
            ],
          },
        ];
      })
    ),
  })),
};

function pendingInstall() {
  let resolve!: (pack: InstalledColoringPack) => void;
  const promise = new Promise<InstalledColoringPack>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(manifest))))
  );
  mocks.installed.mockReset().mockResolvedValue([]);
  mocks.install.mockReset();
  mocks.remove.mockReset();
  mocks.usage.mockReset().mockResolvedValue(0);
});

afterEach(() => {
  resetDownloadedColoringBooks();
  vi.unstubAllGlobals();
});

describe('coloring-pack downloader policy boundaries', () => {
  it('rechecks the download policy before starting the next book', async () => {
    const first = pendingInstall();
    let allowed = true;
    mocks.install.mockReturnValueOnce(first.promise);
    const downloader = createColoringPackDownloader(() => allowed);
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    allowed = false;
    first.resolve({ id: 'dinosaur' });

    await vi.waitFor(() => expect(coloringPackState.downloadingBookId).toBeNull());
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    downloader.stop();
  });

  it('lets an explicit policy change resume a session paused by removal', async () => {
    const first = pendingInstall();
    mocks.installed
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'dinosaur', rootPath: 'file:///dinosaur' }]);
    mocks.install
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ id: 'space', rootPath: 'file:///space' });
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));
    first.resolve({ id: 'dinosaur', rootPath: 'file:///dinosaur' });
    await vi.waitFor(() => expect(coloringPackState.downloadingBookId).toBeNull());

    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    expect(mocks.install.mock.calls[1][1].id).toBe('space');
    downloader.stop();
  });
});
