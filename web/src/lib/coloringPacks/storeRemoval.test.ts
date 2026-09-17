import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // Every pack cache goes, including one an earlier store layout left behind.
  it('removes every web pack cache and nothing else', async () => {
    await createWebColoringPackStore().remove();

    expect(mocks.webDelete.mock.calls).toEqual([
      ['coloring-packs-v2-compact'],
      ['coloring-packs-v2-full'],
      ['coloring-packs-v1-1.2.2-compact'],
    ]);
  });

  // The native side removes every resolution and every earlier layout in one
  // call, with nothing from a manifest: that is what lets removal run offline.
  it('removes native packs in one call that names no manifest', async () => {
    await createNativeColoringPackStore().remove();

    expect(mocks.nativeRemove.mock.calls).toEqual([[]]);
  });
});
