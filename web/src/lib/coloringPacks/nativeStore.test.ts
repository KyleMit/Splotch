import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackManifest } from './manifest';

const mocks = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock('$lib/plugins/coloringPacks', () => ({
  ColoringPacks: { status: mocks.status },
  nativeColoringPackRootUrl: (path: string) => path,
}));

import { createNativeColoringPackStore } from './nativeStore';

const manifest: ResolvedColoringPackManifest = {
  appVersion: '1.2.3-test',
  resolution: 'compact',
  starterBookId: 'farm',
  books: [
    { id: 'farm', bytes: 5, files: [] },
    { id: 'dinosaur', bytes: 3, files: [] },
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

  // A pack left on disk by an earlier manifest has no size to report, and must
  // not make the total NaN.
  it('reports no bytes for an installed pack the manifest no longer lists', async () => {
    mocks.status.mockResolvedValue({ installed: [{ id: 'retired', rootPath: '/packs/retired' }] });

    const packs = await createNativeColoringPackStore().installed(manifest);

    expect(packs).toEqual([{ id: 'retired', bytes: 0, rootPath: '/packs/retired' }]);
  });
});
