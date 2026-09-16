import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocalColoringBookRoot } from './assetResolver';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import type { ColoringPackStore, InstalledColoringPack } from './store';

const settings = vi.hoisted(() => ({
  coloringBookEnabled: true,
  coloringPacksAllowMetered: false,
}));
const mocks = vi.hoisted(() => ({
  installed: vi.fn(),
  install: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('$lib/state/coloringBook.svelte', () => ({ clearOverlay: vi.fn() }));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: settings }));
vi.mock('./assetResolver', () => ({
  clearLocalColoringBookRoots: vi.fn(),
  setLocalColoringBookRoot: vi.fn(),
}));
vi.mock('./nativeStore', () => ({
  createNativeColoringPackStore: (): ColoringPackStore => ({
    installed: mocks.installed,
    install: mocks.install,
    cancel: mocks.cancel,
    remove: mocks.remove,
  }),
}));

import { createColoringPackDownloader, removeDownloadedColoringPacks } from './manager';
import { coloringPacksState, resetDownloadedColoringBooks } from '$lib/state/coloringPacks.svelte';

const manifest = {
  formatVersion: 3,
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

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const pendingInstall = () => pending<InstalledColoringPack>();
const pendingScan = () => pending<InstalledColoringPack[]>();

const flushMicrotasks = () => new Promise<void>((done) => setTimeout(done, 0));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(manifest))))
  );
  mocks.installed.mockReset().mockResolvedValue([]);
  mocks.install.mockReset();
  mocks.cancel.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset();
  vi.mocked(setLocalColoringBookRoot).mockClear();
});

afterEach(() => {
  resetDownloadedColoringBooks();
  vi.unstubAllGlobals();
});

describe('coloring-pack downloader policy boundaries', () => {
  it('does not load the manifest while coloring books are turned off', () => {
    settings.coloringBookEnabled = false;
    try {
      const downloader = createColoringPackDownloader();
      downloader.start();

      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.installed).not.toHaveBeenCalled();
      downloader.stop();
    } finally {
      settings.coloringBookEnabled = true;
    }
  });

  it('publishes installed books without downloading when downloads are not allowed', async () => {
    mocks.installed.mockResolvedValue([{ id: 'space', bytes: 2, rootPath: 'file:///space' }]);
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();

    await vi.waitFor(() => expect(coloringPacksState.installedBookIds).toContain('space'));
    expect(coloringPacksState.downloadedBytes).toBe(2);
    expect(setLocalColoringBookRoot).toHaveBeenCalledWith('space', 'file:///space');
    await flushMicrotasks();
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('skips the manifest on later triggers once a session without downloads has scanned', async () => {
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();
    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    await flushMicrotasks();

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.installed).toHaveBeenCalledOnce();
    downloader.stop();
  });

  it('keeps a scan running when downloads are disallowed before it finishes', async () => {
    const scan = pendingScan();
    let allowed = true;
    mocks.installed.mockReturnValueOnce(scan.promise);
    const downloader = createColoringPackDownloader(() => allowed);
    downloader.start();

    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    allowed = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    scan.resolve([{ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' }]);

    await vi.waitFor(() => expect(coloringPacksState.installedBookIds).toContain('dinosaur'));
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('rescans after coloring books are turned off and back on without downloads', async () => {
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();
    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    await flushMicrotasks();

    settings.coloringBookEnabled = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    settings.coloringBookEnabled = true;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));

    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledTimes(2));
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('rechecks the download policy before starting the next book', async () => {
    const first = pendingInstall();
    let allowed = true;
    mocks.install.mockReturnValueOnce(first.promise);
    const downloader = createColoringPackDownloader(() => allowed);
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    allowed = false;
    first.resolve({ id: 'dinosaur', bytes: 1 });

    await vi.waitFor(() => expect(coloringPacksState.downloadingBookId).toBeNull());
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    downloader.stop();
  });

  it('lets an explicit policy change resume a session paused by removal', async () => {
    const first = pendingInstall();
    mocks.installed
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' }]);
    mocks.install
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ id: 'space', bytes: 1, rootPath: 'file:///space' });
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));
    first.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
    await vi.waitFor(() => expect(coloringPacksState.downloadingBookId).toBeNull());

    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    expect(mocks.install.mock.calls[1][1].id).toBe('space');
    downloader.stop();
  });

  it('cancels an active download and resumes without removing completed packs', async () => {
    const first = pendingInstall();
    let allowed = true;
    mocks.installed.mockResolvedValue([{ id: 'space', bytes: 1, rootPath: 'file:///space' }]);
    mocks.install.mockReturnValueOnce(first.promise).mockImplementationOnce(async () => {
      allowed = false;
      return { id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' };
    });
    mocks.cancel.mockImplementationOnce(async () => {
      first.reject(new Error('cancelled'));
    });
    const downloader = createColoringPackDownloader(() => allowed);
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    allowed = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));

    await vi.waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(coloringPacksState.downloadingBookId).toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(coloringPacksState.installedBookIds).toContain('space');

    allowed = true;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    downloader.stop();
  });
});

describe('removal during an in-flight run', () => {
  it('drops a scan that resolves after the packs were removed', async () => {
    const scan = pendingScan();
    mocks.installed.mockReturnValueOnce(scan.promise);
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    await removeDownloadedColoringPacks();
    expect(mocks.remove).toHaveBeenCalledOnce();

    scan.resolve([{ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' }]);
    await flushMicrotasks();

    expect(coloringPacksState.installedBookIds).toEqual(['farm']);
    expect(coloringPacksState.downloadedBytes).toBe(0);
    expect(setLocalColoringBookRoot).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('drops an install that resolves after the packs were removed', async () => {
    const first = pendingInstall();
    mocks.install.mockReturnValueOnce(first.promise);
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    await removeDownloadedColoringPacks();
    vi.mocked(setLocalColoringBookRoot).mockClear();

    first.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
    await vi.waitFor(() => expect(coloringPacksState.downloadingBookId).toBeNull());
    await flushMicrotasks();

    expect(coloringPacksState.installedBookIds).toEqual(['farm']);
    expect(coloringPacksState.downloadedBytes).toBe(0);
    expect(setLocalColoringBookRoot).not.toHaveBeenCalled();
    downloader.stop();
  });
});

describe('a remounted downloader on native', () => {
  it.each(['removal', 'policy-off'])(
    'cancels the stopped install during a queued remount on %s',
    async (action) => {
      const stale = pendingInstall();
      let allowed = true;
      mocks.install.mockReturnValueOnce(stale.promise);
      const first = createColoringPackDownloader(() => allowed);
      first.start();
      await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
      first.stop();
      const second = createColoringPackDownloader(() => allowed);
      second.start();
      await flushMicrotasks();

      allowed = false;
      if (action === 'removal') await removeDownloadedColoringPacks();
      else window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
      stale.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
      await flushMicrotasks();
      second.stop();
      window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));

      expect(mocks.cancel).toHaveBeenCalledOnce();
      expect(coloringPacksState.installedBookIds).toEqual(['farm']);
      expect(setLocalColoringBookRoot).not.toHaveBeenCalled();
    }
  );

  it('keeps the new run downloading while the stopped run settles its install', async () => {
    const stale = pendingInstall();
    const current = pendingInstall();
    mocks.install.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    mocks.installed
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' }]);
    const first = createColoringPackDownloader();
    first.start();
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    first.stop();

    const second = createColoringPackDownloader();
    second.start();
    await flushMicrotasks();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(coloringPacksState.downloadingBookId).toBe('dinosaur');

    stale.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    expect(mocks.install.mock.calls[1][1].id).toBe('space');
    await flushMicrotasks();

    expect(coloringPacksState.downloadingBookId).toBe('space');
    second.stop();
    current.resolve({ id: 'space', bytes: 1, rootPath: 'file:///space' });
    await flushMicrotasks();
    expect(coloringPacksState.downloadingBookId).toBeNull();
  });

  it('drops a remount that stops while waiting for the previous native install', async () => {
    const stale = pendingInstall();
    mocks.install.mockReturnValueOnce(stale.promise);
    const first = createColoringPackDownloader();
    first.start();
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    first.stop();
    const second = createColoringPackDownloader();
    second.start();
    second.stop();

    stale.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
    await flushMicrotasks();

    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.installed).toHaveBeenCalledOnce();
    expect(coloringPacksState.downloadingBookId).toBeNull();
  });

  it('retries a failed stopped install from the waiting remount', async () => {
    const stale = pendingInstall();
    const current = pendingInstall();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.install.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const first = createColoringPackDownloader();
    first.start();
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    first.stop();
    const second = createColoringPackDownloader();
    second.start();
    stale.reject(new Error('download failed'));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));

    expect(mocks.install.mock.calls[1][1].id).toBe('dinosaur');
    expect(coloringPacksState.downloadingBookId).toBe('dinosaur');
    second.stop();
    current.resolve({ id: 'dinosaur', bytes: 1, rootPath: 'file:///dinosaur' });
    await flushMicrotasks();
    warn.mockRestore();
  });
});

describe('scanning what is installed', () => {
  // Discovering the books and totalling their size were two store reads with
  // identical arguments, so every boot asked twice — a second Capacitor bridge
  // round trip on native, and on the web a second completeness pass that can
  // re-digest every cached file.
  it('reads the store once and totals the bytes it already answered with', async () => {
    mocks.installed.mockResolvedValue([
      { id: 'dinosaur', bytes: 3, rootPath: 'file:///dinosaur' },
      { id: 'space', bytes: 4, rootPath: 'file:///space' },
    ]);
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(coloringPacksState.downloadedBytes).toBe(7));
    expect(mocks.installed).toHaveBeenCalledOnce();
    expect(coloringPacksState.installedBookIds).toContain('dinosaur');
    downloader.stop();
  });
});

describe('removeDownloadedColoringPacks', () => {
  // Reclaiming space is exactly what a device is asked for in a degraded state,
  // so the network failing must not stop it. Before this was keyed off
  // __APP_VERSION__ the path fetched the manifest first and surfaced a failure.
  it('clears the packs while every network request fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeDownloadedColoringPacks()).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith({ appVersion: __APP_VERSION__ });
  });
});
