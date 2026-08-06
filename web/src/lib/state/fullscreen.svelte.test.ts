import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ native: false, standalone: false, android: true }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
  isStandalone: () => mocks.standalone,
  isAndroidBrowser: () => mocks.android,
}));

// The module seeds `fullscreen.supported`/`active` and registers its
// `fullscreenchange` listener at load time, so each test needs a clean import.
async function freshModule() {
  vi.resetModules();
  return import('./fullscreen.svelte');
}

function setFullscreenEnabled(enabled: boolean) {
  Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true });
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
}

beforeEach(() => {
  mocks.native = false;
  mocks.standalone = false;
  mocks.android = true;
  setFullscreenEnabled(true);
  setFullscreenElement(null);
  document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
  document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
});

describe('fullscreenSupported gate', () => {
  it('is unsupported when running inside the native shell', async () => {
    mocks.native = true;
    const { fullscreen } = await freshModule();
    expect(fullscreen.supported).toBe(false);
  });

  it('is unsupported when running as an installed PWA', async () => {
    mocks.standalone = true;
    const { fullscreen } = await freshModule();
    expect(fullscreen.supported).toBe(false);
  });

  it('is unsupported when the Fullscreen API is unavailable', async () => {
    setFullscreenEnabled(false);
    const { fullscreen } = await freshModule();
    expect(fullscreen.supported).toBe(false);
  });

  it('is unsupported off Android', async () => {
    mocks.android = false;
    const { fullscreen } = await freshModule();
    expect(fullscreen.supported).toBe(false);
  });

  it('is supported and reflects the current fullscreen element when all gates pass', async () => {
    setFullscreenElement(document.body);
    const { fullscreen } = await freshModule();
    expect(fullscreen.supported).toBe(true);
    expect(fullscreen.active).toBe(true);
  });
});

describe('fullscreenchange sync', () => {
  it('updates fullscreen.active when the document enters and leaves fullscreen', async () => {
    const { fullscreen } = await freshModule();
    expect(fullscreen.active).toBe(false);

    setFullscreenElement(document.body);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fullscreen.active).toBe(true);

    setFullscreenElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fullscreen.active).toBe(false);
  });
});

describe('toggleFullscreen', () => {
  it('no-ops when unsupported', async () => {
    mocks.android = false;
    const { toggleFullscreen } = await freshModule();
    await toggleFullscreen();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('requests fullscreen when not currently in it', async () => {
    const { toggleFullscreen } = await freshModule();
    await toggleFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('exits fullscreen when currently in it', async () => {
    setFullscreenElement(document.body);
    const { toggleFullscreen } = await freshModule();
    await toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it('swallows a rejected requestFullscreen', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    const { toggleFullscreen } = await freshModule();
    await expect(toggleFullscreen()).resolves.toBeUndefined();
  });

  it('swallows a rejected exitFullscreen', async () => {
    setFullscreenElement(document.body);
    document.exitFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    const { toggleFullscreen } = await freshModule();
    await expect(toggleFullscreen()).resolves.toBeUndefined();
  });
});
