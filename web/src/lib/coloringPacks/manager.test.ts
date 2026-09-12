import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocalColoringBookRoot } from './assetResolver';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import type { ColoringPackStore, InstalledColoringPack } from './store';

const mocks = vi.hoisted(() => ({
  installed: vi.fn(),
  install: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  usage: vi.fn(),
}));

vi.mock('$lib/state/coloringBook.svelte', () => ({ clearOverlay: vi.fn() }));
vi.mock('$lib/state/settings.svelte', () => ({
  settings: { coloringBookEnabled: true, coloringPacksAllowMetered: false },
}));
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
    usage: mocks.usage,
  }),
}));

import { createColoringPackDownloader, removeDownloadedColoringPacks } from './manager';
import { coloringPackState, resetDownloadedColoringBooks } from '$lib/state/coloringPacks.svelte';

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
  mocks.usage.mockReset().mockResolvedValue(0);
  vi.mocked(setLocalColoringBookRoot).mockClear();
});

afterEach(() => {
  resetDownloadedColoringBooks();
  vi.unstubAllGlobals();
});

describe('coloring-pack downloader policy boundaries', () => {
  it('does not load the manifest when downloads are disabled at startup', () => {
    const downloader = createColoringPackDownloader(() => false);
    downloader.start();

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.installed).not.toHaveBeenCalled();
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

  it('cancels an active download and resumes without removing completed packs', async () => {
    const first = pendingInstall();
    let allowed = true;
    mocks.installed.mockResolvedValue([{ id: 'space', rootPath: 'file:///space' }]);
    mocks.install.mockReturnValueOnce(first.promise).mockImplementationOnce(async () => {
      allowed = false;
      return { id: 'dinosaur', rootPath: 'file:///dinosaur' };
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
    await vi.waitFor(() => expect(coloringPackState.downloadingBookId).toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(coloringPackState.installedBookIds).toContain('space');

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
    mocks.usage.mockResolvedValue(1);
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(mocks.installed).toHaveBeenCalledOnce());
    await removeDownloadedColoringPacks();
    expect(mocks.remove).toHaveBeenCalledOnce();

    scan.resolve([{ id: 'dinosaur', rootPath: 'file:///dinosaur' }]);
    await flushMicrotasks();

    expect(coloringPackState.installedBookIds).toEqual(['farm']);
    expect(coloringPackState.downloadedBytes).toBe(0);
    expect(setLocalColoringBookRoot).not.toHaveBeenCalled();
    // The run stops at the abort check between the two store reads, so the
    // size measurement is never even asked for.
    expect(mocks.usage).not.toHaveBeenCalled();
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

    first.resolve({ id: 'dinosaur', rootPath: 'file:///dinosaur' });
    await vi.waitFor(() => expect(coloringPackState.downloadingBookId).toBeNull());
    await flushMicrotasks();

    expect(coloringPackState.installedBookIds).toEqual(['farm']);
    expect(coloringPackState.downloadedBytes).toBe(0);
    expect(setLocalColoringBookRoot).not.toHaveBeenCalled();
    downloader.stop();
  });
});

describe('a store read that fails mid-scan', () => {
  it('still publishes the installed books when the size measurement rejects', async () => {
    mocks.installed.mockResolvedValue([{ id: 'dinosaur', rootPath: 'file:///dinosaur' }]);
    mocks.usage.mockRejectedValue(new Error('usage unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const downloader = createColoringPackDownloader();
    downloader.start();

    await vi.waitFor(() => expect(coloringPackState.installedBookIds).toContain('dinosaur'));
    expect(setLocalColoringBookRoot).toHaveBeenCalledWith('dinosaur', 'file:///dinosaur');
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
