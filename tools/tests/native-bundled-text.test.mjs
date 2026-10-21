import { describe, expect, it, vi } from 'vitest';

const ANDROID_RESOURCE = 'web_static_coloring_farm_catwideoverlay';
const CACHE_COPY = 'file:///data/user/0/app/cache/ExponentAsset-abc.svg';
const OVERLAY_TEXT = '<svg viewBox="0 0 1536 1024"><path d="M0 0h1"/></svg>';

const sdk = vi.hoisted(() => ({ downloaded: [], read: [], localUri: null }));

vi.mock('expo-asset', () => ({
  Asset: {
    fromModule: (asset) => ({
      async downloadAsync() {
        sdk.downloaded.push(asset);
        return { localUri: sdk.localUri };
      },
    }),
  },
}));
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(uri) {
      this.uri = uri;
    }
    async text() {
      sdk.read.push(this.uri);
      return OVERLAY_TEXT;
    }
  },
}));

const { readBundledText } =
  await import('../../experiments/native-architecture/src/platform/bundledText.native.ts');

describe('readBundledText', () => {
  it('reads the local file expo-asset resolves the shipped asset to', async () => {
    sdk.localUri = CACHE_COPY;
    expect(await readBundledText(ANDROID_RESOURCE)).toBe(OVERLAY_TEXT);
    expect(sdk.downloaded).toEqual([ANDROID_RESOURCE]);
    expect(sdk.read).toEqual([CACHE_COPY]);
  });

  it('fails loudly when the asset has no local file', async () => {
    sdk.localUri = null;
    await expect(readBundledText(ANDROID_RESOURCE)).rejects.toThrow(
      'A bundled text file is unavailable.'
    );
  });
});
