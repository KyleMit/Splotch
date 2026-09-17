import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coloringPackMarkerValue } from './cacheKeys';
import type { ResolvedColoringPackManifest } from './manifest';

const mocks = vi.hoisted(() => ({ status: vi.fn(), install: vi.fn() }));

vi.mock('$lib/plugins/coloringPacks', () => ({
  ColoringPacks: { status: mocks.status, install: mocks.install },
  nativeColoringPackRootUrl: (path: string) => path,
}));

import { createNativeColoringPackStore } from './nativeStore';

const dinosaurFile = {
  path: '/coloring/dinosaur/cover.webp',
  downloadPath: '/coloring/dinosaur/cover.webp',
  bytes: 3,
  sha256: 'a'.repeat(64),
};

const manifest: ResolvedColoringPackManifest = {
  appVersion: '1.2.3-test',
  resolution: 'compact',
  starterBookId: 'farm',
  books: [
    { id: 'farm', bytes: 5, files: [] },
    { id: 'dinosaur', bytes: 3, files: [dinosaurFile] },
    { id: 'space', bytes: 4, files: [] },
  ],
};

beforeEach(() => {
  mocks.status.mockReset().mockResolvedValue({
    installed: [
      { id: 'dinosaur', rootPath: '/packs/dinosaur' },
      { id: 'space', rootPath: '/packs/space' },
    ],
  });
  mocks.install.mockReset().mockResolvedValue({ id: 'dinosaur', rootPath: '/packs/dinosaur' });
});

describe('native coloring-pack inventory', () => {
  // Which books are installed and what they cost were two ColoringPacks.status
  // calls with identical arguments, both on the boot path, to produce a total
  // the caller could add up from the list it was already holding.
  it('answers what is installed and what it costs in one bridge call', async () => {
    const packs = await createNativeColoringPackStore().installed(manifest);

    expect(mocks.status).toHaveBeenCalledOnce();
    expect(packs).toEqual([
      { id: 'dinosaur', bytes: 3, rootPath: '/packs/dinosaur' },
      { id: 'space', bytes: 4, rootPath: '/packs/space' },
    ]);
  });

  // An app update keeps a book only if its stored marker still equals the new
  // manifest's, and a version in the storage key would discard every book on
  // every update regardless.
  it('scopes the scan by resolution and hands native each book with its marker', async () => {
    await createNativeColoringPackStore().installed(manifest);

    const [request] = mocks.status.mock.calls[0];
    expect(request).not.toHaveProperty('version');
    expect(request.resolution).toBe('compact');
    expect(request.books.map((book: { id: string }) => book.id)).toEqual(['dinosaur', 'space']);
    expect(request.books[0]).toEqual({
      ...manifest.books[1],
      marker: coloringPackMarkerValue(manifest.books[1]),
    });
  });

  it('installs into the same resolution store with the marker the scan trusts', async () => {
    await createNativeColoringPackStore().install(
      manifest,
      manifest.books[1],
      false,
      new AbortController().signal
    );

    const [request] = mocks.install.mock.calls[0];
    expect(request).not.toHaveProperty('version');
    expect(request.resolution).toBe('compact');
    expect(request.book.marker).toBe(coloringPackMarkerValue(manifest.books[1]));
  });
});
