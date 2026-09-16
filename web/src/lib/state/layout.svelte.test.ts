import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PHONE_LANDSCAPE_QUERY } from '$lib/breakpoints';
import type { SafeAreaInsets } from '$lib/platform/safeArea';
import { createLayout, type LayoutState } from './layout.svelte';

const mocks = vi.hoisted(() => ({
  portrait: false,
  phoneLandscape: false,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform/safeArea', () => ({
  ZERO_INSETS: { top: 0, right: 0, bottom: 0, left: 0 },
  measureSafeAreaInsets: (): SafeAreaInsets => ({ ...mocks.insets }),
}));

const mediaQueryEvents = new Map<string, EventTarget>();

function setMatchMedia() {
  mediaQueryEvents.clear();
  window.matchMedia = ((query: string) => {
    const events = new EventTarget();
    mediaQueryEvents.set(query, events);
    return {
      get matches() {
        return query === PHONE_LANDSCAPE_QUERY
          ? mocks.phoneLandscape
          : query.includes('portrait')
            ? mocks.portrait
            : !mocks.portrait;
      },
      media: query,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    };
  }) as typeof window.matchMedia;
}

let layout: LayoutState | null = null;

// The instance measures the viewport and installs its listeners on install, so
// each test builds and installs its own against the stubs it set up.
function installLayout() {
  layout = createLayout();
  layout.install();
  return layout;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.portrait = false;
  mocks.phoneLandscape = false;
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
  layout?.dispose();
  layout = null;
  vi.useRealTimers();
});

describe('viewport tracking', () => {
  it('holds the prerender defaults until installed', () => {
    const state = createLayout();
    expect(state.orientation).toBe('landscape');
    expect(state.viewportWidth).toBe(0);
    expect(state.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('refuses writes through the safe-area getter', () => {
    const state = createLayout();

    expect(() => {
      Object.assign(state.safeArea, { top: 44 });
    }).toThrow(TypeError);
    expect(state.safeArea.top).toBe(0);
  });

  it('seeds orientation and safe-area insets on install', () => {
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const state = installLayout();
    expect(state.orientation).toBe('portrait');
    expect(state.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
    expect(document.documentElement.dataset.orientation).toBe('portrait');
  });

  it('takes the phone class from CSS rather than the visible viewport height', () => {
    window.innerWidth = 960;
    window.innerHeight = 550;
    const state = installLayout();
    expect(state.phoneLandscape).toBe(false);
    mocks.phoneLandscape = true;
    window.dispatchEvent(new Event('resize'));
    expect(state.phoneLandscape).toBe(true);
  });

  it('updates the phone media class without releasing a pending rotation', () => {
    mocks.portrait = true;
    window.innerWidth = 412;
    window.innerHeight = 906;
    const state = installLayout();
    window.dispatchEvent(new Event('orientationchange'));
    mocks.portrait = false;
    mocks.phoneLandscape = true;
    window.innerWidth = 906;
    window.innerHeight = 328;
    mediaQueryEvents.get(PHONE_LANDSCAPE_QUERY)?.dispatchEvent(new Event('change'));
    expect(state.phoneLandscape).toBe(true);
    expect(state.orientation).toBe('portrait');
    vi.advanceTimersByTime(200);
    expect(state.orientation).toBe('landscape');
  });

  it('re-measures on resize', () => {
    window.innerWidth = 1024;
    window.innerHeight = 768;
    const state = installLayout();
    expect(state.orientation).toBe('landscape');
    expect(state.viewportWidth).toBe(1024);
    expect(state.viewportHeight).toBe(768);

    mocks.portrait = true;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    // The dimensions feed JS-side layout math (actionButtonLayout, the Settings
    // size ceiling), so a resize that stopped syncing them has to fail here.
    window.innerWidth = 768;
    window.innerHeight = 1024;
    window.dispatchEvent(new Event('resize'));

    expect(state.orientation).toBe('portrait');
    expect(state.safeArea.top).toBe(44);
    expect(state.viewportWidth).toBe(768);
    expect(state.viewportHeight).toBe(1024);
  });

  it('keeps the DOM stamp defined by CSS orientation when viewport geometry differs', () => {
    window.innerWidth = 768;
    window.innerHeight = 1024;
    const state = installLayout();

    expect(state.orientation).toBe('portrait');
    expect(document.documentElement.dataset.orientation).toBe('landscape');
  });

  it('keeps layout current throughout a continuous non-rotation resize stream', async () => {
    const state = installLayout();

    for (let step = 1; step <= 20; step += 1) {
      window.innerWidth = 1024 - step * 10;
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(state.viewportWidth).toBe(824);
  });

  it('re-measures on re-entry when the device rotated while backgrounded', () => {
    const state = installLayout();
    expect(state.orientation).toBe('landscape');

    // A hidden document fires no resize/orientationchange, so the rotation
    // reaches the app only via the visibilitychange on return.
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    document.dispatchEvent(new Event('visibilitychange'));

    expect(state.orientation).toBe('portrait');
    expect(state.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
  });

  it('follows the cutout inset from the top to a side edge across a rotation', async () => {
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    mocks.insets = { top: 44, right: 0, bottom: 34, left: 0 };
    const state = installLayout();

    // Rotation: the standard orientation event fires, then the insets settle
    // onto a side edge and a resize follows.
    mocks.portrait = false;
    mocks.phoneLandscape = false;
    window.innerWidth = 1024;
    window.innerHeight = 768;
    screen.orientation.dispatchEvent(new Event('change'));
    mocks.insets = { top: 0, right: 44, bottom: 21, left: 0 };
    window.dispatchEvent(new Event('resize'));

    expect(state.orientation).toBe('portrait');
    expect(state.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
    await vi.runAllTimersAsync();

    expect(state.orientation).toBe('landscape');
    expect(state.safeArea).toEqual({ top: 0, right: 44, bottom: 21, left: 0 });
  });

  it('retains the legacy orientationchange trigger used by Mobile Safari', async () => {
    const state = installLayout();

    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('resize'));

    expect(state.orientation).toBe('landscape');
    await vi.runAllTimersAsync();
    expect(state.orientation).toBe('portrait');
  });

  it('stops listening and drops a pending rotation once disposed', () => {
    const state = installLayout();
    window.dispatchEvent(new Event('orientationchange'));

    state.dispose();
    mocks.portrait = true;
    window.innerWidth = 768;
    window.innerHeight = 1024;
    vi.advanceTimersByTime(200);
    window.dispatchEvent(new Event('resize'));

    expect(state.orientation).toBe('landscape');
    expect(state.viewportWidth).toBe(1024);
  });
});
