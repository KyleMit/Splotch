import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackManifest } from './manifest';

const mocks = vi.hoisted(() => ({
  nativeCancel: vi.fn(),
  nativeRemove: vi.fn(),
  webDelete: vi.fn(),
}));

vi.mock('$lib/plugins/coloringPacks', () => ({
  ColoringPacks: { cancel: mocks.nativeCancel, remove: mocks.nativeRemove },
  nativeColoringPackRootUrl: (path: string) => path,
}));

import { createNativeColoringPackStore } from './nativeStore';
import { createWebColoringPackStore } from './webStore';

const manifest: ResolvedColoringPackManifest = {
  appVersion: '1.2.3-test',
  resolution: 'compact',
  starterBookId: 'farm',
  books: [],
};

beforeEach(() => {
  mocks.nativeCancel.mockReset().mockResolvedValue(undefined);
  mocks.nativeRemove.mockReset().mockResolvedValue(undefined);
  mocks.webDelete.mockReset().mockResolvedValue(true);
  vi.stubGlobal('caches', {
    keys: vi
      .fn()
      .mockResolvedValue([
        'coloring-packs-v2-compact',
        'workbox-precache-v2-https://splotch.art/',
        'coloring-packs-v2-full',
        'pages',
        'coloring-packs-v1-1.2.2-compact',
      ]),
    delete: mocks.webDelete,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('coloring-pack removal', () => {
  it('cancels native work without removing either stored resolution', async () => {
    await createNativeColoringPackStore().cancel();

    expect(mocks.nativeCancel).toHaveBeenCalledOnce();
    expect(mocks.nativeRemove).not.toHaveBeenCalled();
  });

  // The web cache is not scoped by app version, so the version is ignored and
  // every pack cache goes, including one an earlier store layout left behind.
  it('removes every web pack cache and nothing else', async () => {
    await createWebColoringPackStore().remove({ appVersion: manifest.appVersion });

    expect(mocks.webDelete.mock.calls).toEqual([
      ['coloring-packs-v2-compact'],
      ['coloring-packs-v2-full'],
      ['coloring-packs-v1-1.2.2-compact'],
    ]);
  });

  // Passing only the app version, not the whole manifest: that narrowing is
  // what lets removal run with no network.
  it('removes both native resolution namespaces', async () => {
    await createNativeColoringPackStore().remove({ appVersion: manifest.appVersion });

    expect(mocks.nativeRemove.mock.calls).toEqual([
      [{ version: '1.2.3-test-compact' }],
      [{ version: '1.2.3-test-full' }],
    ]);
  });
});
