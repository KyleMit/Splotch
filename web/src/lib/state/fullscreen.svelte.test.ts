import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFullscreen, type FullscreenState } from './fullscreen.svelte';

const mocks = vi.hoisted(() => ({
  native: false,
  standalone: false,
  android: true,
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
  isStandalone: () => mocks.standalone,
  isAndroidBrowser: () => mocks.android,
}));

let fullscreen: FullscreenState | null = null;

// The instance seeds `supported`/`active` and registers its `fullscreenchange`
// listener on install, so each test builds and installs its own.
function installFullscreen() {
  fullscreen = createFullscreen();
  fullscreen.install();
  return fullscreen;
}

function setFullscreenEnabled(enabled: boolean) {
  Object.defineProperty(document, 'fullscreenEnabled', {
    value: enabled,
    configurable: true,
  });
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: element,
    configurable: true,
  });
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

afterEach(() => {
  fullscreen?.dispose();
  fullscreen = null;
});

describe('fullscreenSupported gate', () => {
  it('is unsupported when running inside the native shell', () => {
    mocks.native = true;
    expect(installFullscreen().supported).toBe(false);
  });

  it('is unsupported when running as an installed PWA', () => {
    mocks.standalone = true;
    expect(installFullscreen().supported).toBe(false);
  });

  it('is unsupported when the Fullscreen API is unavailable', () => {
    setFullscreenEnabled(false);
    expect(installFullscreen().supported).toBe(false);
  });

  it('is unsupported off Android', () => {
    mocks.android = false;
    expect(installFullscreen().supported).toBe(false);
  });

  it('is supported and reflects the current fullscreen element when all gates pass', () => {
    setFullscreenElement(document.body);
    const state = installFullscreen();
    expect(state.supported).toBe(true);
    expect(state.active).toBe(true);
  });
});

describe('fullscreenchange sync', () => {
  it('updates active when the document enters and leaves fullscreen', () => {
    const state = installFullscreen();
    expect(state.active).toBe(false);

    setFullscreenElement(document.body);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.active).toBe(true);

    setFullscreenElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.active).toBe(false);
  });

  it('stops syncing once disposed', () => {
    const state = installFullscreen();
    state.dispose();

    setFullscreenElement(document.body);
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(state.active).toBe(false);
  });
});

describe('toggleFullscreen', () => {
  it('no-ops when unsupported', async () => {
    mocks.android = false;
    await installFullscreen().toggleFullscreen();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('requests fullscreen when not currently in it', async () => {
    await installFullscreen().toggleFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('exits fullscreen when currently in it', async () => {
    setFullscreenElement(document.body);
    await installFullscreen().toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it('swallows a rejected requestFullscreen', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(installFullscreen().toggleFullscreen()).resolves.toBeUndefined();
  });

  it('swallows a rejected exitFullscreen', async () => {
    setFullscreenElement(document.body);
    document.exitFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(installFullscreen().toggleFullscreen()).resolves.toBeUndefined();
  });
});
