import { describe, expect, it, vi } from 'vitest';
import { coloringPackManifestPath, type ColoringPackManifest } from './manifest';
import { DIGESTS, useWebStoreWorld, type Content } from './webStoreTestHarness';

vi.mock('$lib/idle', () => ({ scheduleIdle: vi.fn() }));
vi.mock('$lib/state/coloringBook.svelte', () => ({ clearOverlay: vi.fn() }));
vi.mock('$lib/state/settings.svelte', () => ({
  settingsState: { coloringBookEnabled: true, coloringPacksAllowMetered: false },
}));
// The unit config compiles __IS_CAPACITOR__ true, so the manager asks for the
// native store; handing it the real web store runs the web failure path whole.
vi.mock('./nativeStore', async () => ({
  createNativeColoringPackStore: (await import('./webStore')).createWebColoringPackStore,
}));

import { createColoringPackDownloader } from './manager';
import { coloringPacksState } from '$lib/state/coloringPacks.svelte';

const world = useWebStoreWorld();

const PAGES: Record<string, Content> = { cover: 'a', first: 'a', second: 'b' };

function variant(bookId: string, pages: string[], compactTier?: string) {
  const files = pages.map((page) => ({
    path: `/coloring/${bookId}/${page}.webp`,
    ...(compactTier && { downloadPath: `/coloring/${compactTier}/${bookId}/${page}.webp` }),
    bytes: 1,
    sha256: DIGESTS[PAGES[page]],
  }));
  return { bytes: files.length, files };
}

function book(id: string, pages: string[]) {
  return { id, variants: { compact: variant(id, pages, 'max-240px'), full: variant(id, pages) } };
}

const manifest: ColoringPackManifest = {
  formatVersion: 3,
  appVersion: __APP_VERSION__,
  starterBookId: 'farm',
  books: [book('farm', ['cover']), book('dinosaur', ['first', 'second'])],
};

function serveWithOneCorruptResponse(corruptPage: string) {
  let corrupted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === coloringPackManifestPath(__APP_VERSION__)) {
        return new Response(JSON.stringify(manifest));
      }
      const page = /([^/]+)\.webp$/.exec(url)![1];
      if (page !== corruptPage || corrupted) return new Response(PAGES[page]);
      corrupted = true;
      return new Response('c');
    })
  );
}

const pageFetches = (page: string) =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(`/${page}.webp`)).length;

describe('a web download that arrives corrupt', () => {
  it('publishes nothing, then the next trigger refetches only that file and installs the book', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    serveWithOneCorruptResponse('second');
    const downloader = createColoringPackDownloader(() => true);
    downloader.start();

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'Coloring-pack download paused',
        expect.objectContaining({
          message: 'Coloring asset digest mismatch: /coloring/dinosaur/second.webp',
        })
      )
    );
    expect(coloringPacksState.installedBookIds).toEqual(['farm']);
    expect(await world.servedByWorker('/coloring/dinosaur/second.webp')).toBeUndefined();

    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() =>
      expect(coloringPacksState.installedBookIds).toEqual(['farm', 'dinosaur'])
    );
    expect(await world.servedByWorker('/coloring/dinosaur/second.webp')).toBe('b');
    expect(pageFetches('first')).toBe(1);
    expect(pageFetches('second')).toBe(2);
    downloader.stop();
    warn.mockRestore();
  });
});
