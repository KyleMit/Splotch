import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SafeAreaInsets } from '$lib/platform/safeArea';

const mocks = vi.hoisted(() => ({
  portrait: false,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform/safeArea', () => ({
  ZERO_INSETS: { top: 0, right: 0, bottom: 0, left: 0 },
  measureSafeAreaInsets: (): SafeAreaInsets => ({ ...mocks.insets }),
}));

function setMatchMedia() {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('portrait') ? mocks.portrait : !mocks.portrait;
    },
    media: query,
    addEventListener() {},
    removeEventListener() {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;
}

// The module installs its listeners and seeds state at load, so each test
// needs a pristine copy.
async function freshModule() {
  vi.resetModules();
  return import('./layout.svelte');
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.portrait = false;
  mocks.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  window.innerWidth = 1024;
  window.innerHeight = 768;
  delete document.documentElement.dataset.orientation;
  Object.defineProperty(screen, 'orientation', {
    configurable: true,
    value: new EventTarget(),
  });
  setMatchMedia();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('viewport tracking', () => {
  it('seeds orientation and safe-area insets at module load', async () => {
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const { layout } = await freshModule();
    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
    expect(document.documentElement.dataset.orientation).toBe('portrait');
  });

  it('re-measures on resize', async () => {
    window.innerWidth = 1024;
    window.innerHeight = 768;
    const { layout } = await freshModule();
    expect(layout.orientation).toBe('landscape');
    expect(layout.viewportWidth).toBe(1024);
    expect(layout.viewportHeight).toBe(768);

    mocks.portrait = true;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    // The dimensions feed JS-side layout math (actionButtonLayout, the Settings
    // size ceiling), so a resize that stopped syncing them has to fail here.
    window.innerWidth = 768;
    window.innerHeight = 1024;
    window.dispatchEvent(new Event('resize'));

    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea.top).toBe(44);
    expect(layout.viewportWidth).toBe(768);
    expect(layout.viewportHeight).toBe(1024);
  });

  it('keeps the DOM stamp defined by CSS orientation when viewport geometry differs', async () => {
    window.innerWidth = 768;
    window.innerHeight = 1024;
    const { layout } = await freshModule();

    expect(layout.orientation).toBe('portrait');
    expect(document.documentElement.dataset.orientation).toBe('landscape');
  });

  it('keeps layout current throughout a continuous non-rotation resize stream', async () => {
    const { layout, publishPaletteMeasurement } = await freshModule();

    for (let step = 1; step <= 20; step += 1) {
      window.innerWidth = 1024 - step * 10;
      publishPaletteMeasurement(156 - step, 76);
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(layout.viewportWidth).toBe(824);
    expect(layout.paletteMeasurement).toEqual({
      width: 136,
      height: 76,
      orientation: 'landscape',
    });
  });

  it('re-measures on re-entry when the device rotated while backgrounded', async () => {
    const { layout } = await freshModule();
    expect(layout.orientation).toBe('landscape');

    // A hidden document fires no resize/orientationchange, so the rotation
    // reaches the app only via the visibilitychange on return.
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    document.dispatchEvent(new Event('visibilitychange'));

    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
  });

  it('follows the cutout inset from the top to a side edge across a rotation', async () => {
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const { layout, publishPaletteMeasurement } = await freshModule();

    // Rotation: the standard orientation event fires, then the insets settle
    // onto a side edge and a resize follows.
    mocks.portrait = false;
    window.innerWidth = 1024;
    window.innerHeight = 768;
    screen.orientation.dispatchEvent(new Event('change'));
    publishPaletteMeasurement(84, 768);
    mocks.insets = { top: 0, right: 44, bottom: 21, left: 0 };
    window.dispatchEvent(new Event('resize'));

    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
    expect(layout.paletteMeasurement).toEqual({ width: 0, height: 0, orientation: null });
    await vi.runAllTimersAsync();

    expect(layout.orientation).toBe('landscape');
    expect(layout.safeArea).toEqual({ top: 0, right: 44, bottom: 21, left: 0 });
    expect(layout.paletteMeasurement).toEqual({ width: 84, height: 768, orientation: 'landscape' });
  });

  it('retains the legacy orientationchange trigger used by Mobile Safari', async () => {
    const { layout } = await freshModule();

    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('resize'));

    expect(layout.orientation).toBe('landscape');
    await vi.runAllTimersAsync();
    expect(layout.orientation).toBe('portrait');
  });

  it('tags palette measurements with the live CSS orientation', async () => {
    const { clearPaletteMeasurement, layout, publishPaletteMeasurement } = await freshModule();
    document.documentElement.dataset.orientation = 'portrait';

    publishPaletteMeasurement(84, 768);
    expect(layout.paletteMeasurement).toEqual({
      width: 84,
      height: 768,
      orientation: 'landscape',
    });

    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    publishPaletteMeasurement(375, 76);
    expect(layout.paletteMeasurement.orientation).toBe('portrait');

    clearPaletteMeasurement();
    expect(layout.paletteMeasurement).toEqual({ width: 0, height: 0, orientation: null });
  });

  it('keeps a pre-rotation palette rect tagged to its CSS orientation', async () => {
    const { layout, publishPaletteMeasurement } = await freshModule();

    window.innerWidth = 768;
    window.innerHeight = 1024;
    window.dispatchEvent(new Event('orientationchange'));
    publishPaletteMeasurement(84, 768);
    mocks.portrait = true;
    await vi.runAllTimersAsync();

    expect(layout.orientation).toBe('portrait');
    expect(layout.paletteMeasurement).toEqual({
      width: 84,
      height: 768,
      orientation: 'landscape',
    });
  });
});
