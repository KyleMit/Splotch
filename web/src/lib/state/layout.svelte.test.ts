import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SafeAreaInsets } from '$lib/safeArea';

const mocks = vi.hoisted(() => ({
  portrait: false,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/safeArea', () => ({
  ZERO_INSETS: { top: 0, right: 0, bottom: 0, left: 0 },
  measureSafeAreaInsets: (): SafeAreaInsets => ({ ...mocks.insets }),
}));

function setMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('portrait') ? mocks.portrait : !mocks.portrait,
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
  mocks.portrait = false;
  mocks.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  setMatchMedia();
});

describe('viewport tracking', () => {
  it('seeds orientation and safe-area insets at module load', async () => {
    mocks.portrait = true;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const { layout } = await freshModule();
    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
  });

  it('re-measures on resize', async () => {
    const { layout } = await freshModule();
    expect(layout.orientation).toBe('landscape');

    mocks.portrait = true;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    window.dispatchEvent(new Event('resize'));

    expect(layout.orientation).toBe('portrait');
    expect(layout.safeArea.top).toBe(44);
  });

  it('follows the cutout inset from the top to a side edge across a rotation', async () => {
    mocks.portrait = true;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const { layout } = await freshModule();

    // Rotation: orientationchange fires, then the insets settle onto a side
    // edge and a resize follows — the same listener pair re-measures on both.
    mocks.portrait = false;
    window.dispatchEvent(new Event('orientationchange'));
    mocks.insets = { top: 0, right: 44, bottom: 21, left: 0 };
    window.dispatchEvent(new Event('resize'));

    expect(layout.orientation).toBe('landscape');
    expect(layout.safeArea).toEqual({ top: 0, right: 44, bottom: 21, left: 0 });
  });
});
