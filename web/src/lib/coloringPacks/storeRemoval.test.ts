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
  vi.stubGlobal('caches', { delete: mocks.webDelete });
});

afterEach(() => vi.unstubAllGlobals());

describe('coloring-pack removal', () => {
  it('cancels native work without removing either stored resolution', async () => {
    await createNativeColoringPackStore().cancel();

    expect(mocks.nativeCancel).toHaveBeenCalledOnce();
    expect(mocks.nativeRemove).not.toHaveBeenCalled();
  });

  it('removes both web resolution namespaces', async () => {
    await createWebColoringPackStore().remove(manifest);

    expect(mocks.webDelete.mock.calls).toEqual([
      ['coloring-packs-v1-1.2.3-test-compact'],
      ['coloring-packs-v1-1.2.3-test-full'],
    ]);
  });

  it('removes both native resolution namespaces', async () => {
    await createNativeColoringPackStore().remove(manifest);

    expect(mocks.nativeRemove.mock.calls).toEqual([
      [{ version: '1.2.3-test-compact' }],
      [{ version: '1.2.3-test-full' }],
    ]);
  });
});
