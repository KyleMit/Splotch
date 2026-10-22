import { afterEach, describe, expect, it, vi } from 'vitest';

const ASSET_ID = 7;
const ANDROID_RESOURCE = '__web_static_coloring_farm_catwideoverlay';
const IOS_FILE = 'file:///private/var/containers/Bundle/Application/X/Splotch.app/assets/a.svg';
const DEV_SERVER = 'http://localhost:8081/assets/assets/static/coloring/farm/cat-wide.overlay.svg';
const OVERLAY_TEXT = '<svg viewBox="0 0 1536 1024"><path d="M0 0h1"/></svg>';

const sdk = vi.hoisted(() => ({ resolved: null, read: [] }));

vi.mock('react-native', () => ({
  Image: { resolveAssetSource: () => ({ uri: sdk.resolved }) },
}));
vi.mock('expo-file-system/legacy', () => ({
  async readAsStringAsync(uri) {
    sdk.read.push(uri);
    return OVERLAY_TEXT;
  },
}));

const { readBundledText } = await import('../../src/platform/bundledText.native.ts');

afterEach(() => {
  sdk.read = [];
  vi.unstubAllGlobals();
});

describe('readBundledText', () => {
  it.each([
    ['an Android raw resource by its bare name', ANDROID_RESOURCE],
    ['an iOS file inside the app', IOS_FILE],
  ])('reads %s in place', async (_label, uri) => {
    sdk.resolved = uri;
    expect(await readBundledText(ASSET_ID)).toBe(OVERLAY_TEXT);
    expect(sdk.read).toEqual([uri]);
  });

  it("fetches a development build's asset from the Metro server", async () => {
    sdk.resolved = DEV_SERVER;
    const fetch = vi.fn(async () => ({ text: async () => OVERLAY_TEXT }));
    vi.stubGlobal('fetch', fetch);
    expect(await readBundledText(ASSET_ID)).toBe(OVERLAY_TEXT);
    expect(fetch).toHaveBeenCalledWith(DEV_SERVER);
    expect(sdk.read).toEqual([]);
  });
});
