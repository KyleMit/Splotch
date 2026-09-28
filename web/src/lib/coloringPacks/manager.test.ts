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

const installedPack = (id: string, bytes: number): InstalledColoringPack => ({
  id,
  bytes,
  rootUrl: `capacitor://localhost/_capacitor_file_/packs/${id}`,
});

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
    mocks.installed.mockResolvedValue([installedPack('space', 2)]);
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();

    await vi.waitFor(() => expect(coloringPacksState.installedBookIds).toContain('space'));
    expect(coloringPacksState.downloadedBytes).toBe(2);
    expect(setLocalColoringBookRoot).toHaveBeenCalledWith(
      'space',
      installedPack('space', 2).rootUrl
    );
    await flushMicrotasks();
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('rescans the store on later triggers without refetching the manifest', async () => {
    mocks.installed
      .mockResolvedValueOnce([installedPack('dinosaur', 1)])
      .mockResolvedValue([installedPack('space', 1)]);
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();
    await vi.waitFor(() => expect(coloringPacksState.installedBookIds).toContain('dinosaur'));

    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() => expect(coloringPacksState.installedBookIds).toEqual(['farm', 'space']));
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.install).not.toHaveBeenCalled();
    downloader.stop();
  });

  it('keeps a scan running when downloads are disallowed before it finishes', async () => {
    const scan = pendingScan();
    let allowed = true;
    mocks.installed
      .mockReturnValueOnce(scan.promise)
      .mockResolvedValue([installedPack('dinosaur', 1)]);
    const downloader = createColoringPackDownloader(() => allowed);
    downloader.start();

    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    allowed = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    scan.resolve([installedPack('dinosaur', 1)]);

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

    await vi.waitFor(() => expect(mocks.installed.mock.calls.length).toBeGreaterThan(1));
    expect(fetch).toHaveBeenCalledOnce();
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
    mocks.installed.mockResolvedValueOnce([]).mockResolvedValue([installedPack('dinosaur', 1)]);
    mocks.install
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(installedPack('space', 1));
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));
    first.resolve(installedPack('dinosaur', 1));
    await vi.waitFor(() => expect(coloringPacksState.downloadingBookId).toBeNull());

    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    expect(mocks.install.mock.calls[1][1].id).toBe('space');
    downloader.stop();
  });

  it('cancels an active download and resumes without removing completed packs', async () => {
    const first = pendingInstall();
    let allowed = true;
    mocks.installed.mockResolvedValue([installedPack('space', 1)]);
    mocks.install.mockReturnValueOnce(first.promise).mockImplementationOnce(async () => {
      allowed = false;
      return installedPack('dinosaur', 1);
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

    scan.resolve([installedPack('dinosaur', 1)]);
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

    first.resolve(installedPack('dinosaur', 1));
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
      stale.resolve(installedPack('dinosaur', 1));
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
    mocks.installed.mockResolvedValueOnce([]).mockResolvedValue([installedPack('dinosaur', 1)]);
    const first = createColoringPackDownloader();
    first.start();
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    first.stop();

    const second = createColoringPackDownloader();
    second.start();
    await flushMicrotasks();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(coloringPacksState.downloadingBookId).toBe('dinosaur');

    stale.resolve(installedPack('dinosaur', 1));
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    expect(mocks.install.mock.calls[1][1].id).toBe('space');
    await flushMicrotasks();

    expect(coloringPacksState.downloadingBookId).toBe('space');
    second.stop();
    current.resolve(installedPack('space', 1));
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

    stale.resolve(installedPack('dinosaur', 1));
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
    current.resolve(installedPack('dinosaur', 1));
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
    mocks.installed.mockResolvedValue([installedPack('dinosaur', 3), installedPack('space', 4)]);
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(coloringPacksState.downloadedBytes).toBe(7));
    expect(mocks.installed).toHaveBeenCalledOnce();
    expect(coloringPacksState.installedBookIds).toContain('dinosaur');
    downloader.stop();
  });
});

describe('a run that fails', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  const pausedRun = () =>
    vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Coloring-pack download paused', expect.any(Error))
    );

  // Downloads stay off because that is when the loader reuses the manifest it
  // holds: a failed load must leave nothing behind to reuse.
  it.each([
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['answers with a server error', async () => new Response(null, { status: 500 })],
    ['is not JSON', async () => new Response('<html>Sign in to Wi-Fi</html>')],
    [
      'names another app version',
      async () => new Response(JSON.stringify({ ...manifest, appVersion: '0.9.0-test' })),
    ],
  ])(
    'scans nothing when the manifest %s, and the next online trigger refetches it',
    async (_case, failedManifest) => {
      vi.mocked(fetch).mockImplementationOnce(failedManifest);
      mocks.installed.mockResolvedValue([installedPack('space', 1)]);
      const downloader = createColoringPackDownloader(() => false);
      downloader.start();

      await pausedRun();
      expect(mocks.installed).not.toHaveBeenCalled();
      expect(coloringPacksState.installedBookIds).toEqual(['farm']);
      expect(coloringPacksState.downloadingBookId).toBeNull();

      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() =>
        expect(coloringPacksState.installedBookIds).toEqual(['farm', 'space'])
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      downloader.stop();
    }
  );

  it('retries a book whose download failed on the next online trigger', async () => {
    mocks.install
      .mockRejectedValueOnce(new Error('Coloring asset digest mismatch'))
      .mockImplementation(async (_manifest, book) => installedPack(book.id, 1));
    const downloader = createColoringPackDownloader(() => true);
    downloader.start();

    await pausedRun();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(coloringPacksState.installedBookIds).toEqual(['farm']);
    expect(coloringPacksState.downloadingBookId).toBeNull();

    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() =>
      expect(coloringPacksState.installedBookIds).toEqual(['farm', 'dinosaur', 'space'])
    );
    expect(mocks.install.mock.calls.map(([, book]) => book.id)).toEqual([
      'dinosaur',
      'dinosaur',
      'space',
    ]);
    downloader.stop();
  });
});

describe('removeDownloadedColoringPacks', () => {
  // Reclaiming space is exactly what a device is asked for in a degraded state,
  // so the network failing must not stop it. The path once fetched the manifest
  // first and surfaced that failure.
  it('clears the packs while every network request fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeDownloadedColoringPacks()).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith();
  });
});
