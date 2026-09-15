import { browser } from '$app/environment';
import { PHONE_LANDSCAPE_QUERY } from '$lib/breakpoints';
import type { Orientation } from '$lib/platform';
import { measureSafeAreaInsets, ZERO_INSETS, type SafeAreaInsets } from '$lib/platform/safeArea';

// Viewport facts JS-side layout consumers derive from — the Button Size
// slider's ceiling, the Install Banner, the Notch Band, the engine's edge-swipe
// bands. Element geometry is not published here: the Color Palette's extents
// are CSS declarations (app.css --palette-landscape-width /
// --palette-portrait-height) that the Actions Panel reads in the stylesheet.
export interface LayoutState {
  // Viewport orientation, kept fresh by the single shared listener set install()
  // registers (resize, legacy and standard orientation changes, and visibility
  // re-entry) so components can $derive off it instead of each wiring its own
  // listeners. Stays 'landscape' during prerender (no DOM).
  readonly orientation: Orientation;
  // The measured env(safe-area-inset-*) values.
  readonly safeArea: Readonly<SafeAreaInsets>;
  // screen.orientation.angle, or 0 where the API is absent. Distinguishes the
  // two landscape rotations, which the insets alone cannot on iOS — the Notch
  // Band needs it to know which side the cutout is on (lib/platform/notchBand).
  readonly orientationAngle: number;
  // Viewport dimensions in CSS px, for JS-side layout math (e.g. the dynamic
  // Button Size ceiling in Settings). 0 during prerender.
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly phoneLandscape: boolean;
  // Measures the viewport and subscribes to the events that change it.
  install(): void;
  dispose(): void;
}

// The physical-iPad profile for issue 977 improved with a 200 ms rotation-only
// hold. This bounds JS layout lag during orientation events (ADR-0142 scores
// the deferred work in the post-action frame window); ordinary resizes
// continue publishing synchronously.
const ROTATION_VIEWPORT_SETTLE_MS = 200;

function readOrientationAngle(): number {
  const angle = screen.orientation?.angle;
  return typeof angle === 'number' ? angle : 0;
}

export function createLayout(): LayoutState {
  const s = $state<{
    orientation: Orientation;
    safeArea: SafeAreaInsets;
    orientationAngle: number;
    viewportWidth: number;
    viewportHeight: number;
    phoneLandscape: boolean;
  }>({
    orientation: 'landscape',
    safeArea: { ...ZERO_INSETS },
    orientationAngle: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    phoneLandscape: false,
  });

  let portraitQuery: MediaQueryList | null = null;
  let phoneLandscapeQuery: MediaQueryList | null = null;
  // Deliberately untracked: a timer handle nothing renders.
  let rotationViewportSyncTimer: number | undefined;
  let installed = false;

  function readCssOrientation(): Orientation {
    return (portraitQuery?.matches ?? false) ? 'portrait' : 'landscape';
  }

  function readViewportOrientation(): Orientation {
    if (window.innerWidth > window.innerHeight) return 'landscape';
    if (window.innerHeight > window.innerWidth) return 'portrait';
    return readCssOrientation();
  }

  function syncPhoneLandscape() {
    s.phoneLandscape = phoneLandscapeQuery?.matches ?? false;
  }

  function syncViewport() {
    s.orientation = readViewportOrientation();
    // Keep the [data-orientation] hook the head script stamped in sync on rotate.
    document.documentElement.dataset.orientation = readCssOrientation();
    // Per-field assign so equal re-measurements don't wake dependents.
    Object.assign(s.safeArea, measureSafeAreaInsets());
    s.orientationAngle = readOrientationAngle();
    s.viewportWidth = window.innerWidth;
    s.viewportHeight = window.innerHeight;
    syncPhoneLandscape();
  }

  function finishViewportRotation() {
    rotationViewportSyncTimer = undefined;
    syncViewport();
  }

  function deferViewportSyncForRotation() {
    if (rotationViewportSyncTimer !== undefined) return;
    rotationViewportSyncTimer = window.setTimeout(
      finishViewportRotation,
      ROTATION_VIEWPORT_SETTLE_MS
    );
  }

  function syncViewportImmediately() {
    if (rotationViewportSyncTimer !== undefined) {
      window.clearTimeout(rotationViewportSyncTimer);
      rotationViewportSyncTimer = undefined;
    }
    syncViewport();
  }

  function syncViewportOnResize() {
    if (rotationViewportSyncTimer === undefined) syncViewportImmediately();
  }

  // Hidden documents can miss rotations, so re-measure on visibility re-entry.
  // Android WebViews can remain visible while backgrounded; their resume-time
  // resize already reaches syncViewportOnResize, without a separate resume listener.
  function syncViewportOnVisible() {
    if (document.visibilityState === 'visible') syncViewportImmediately();
  }

  return {
    get orientation() {
      return s.orientation;
    },
    get safeArea() {
      return s.safeArea;
    },
    get orientationAngle() {
      return s.orientationAngle;
    },
    get viewportWidth() {
      return s.viewportWidth;
    },
    get viewportHeight() {
      return s.viewportHeight;
    },
    get phoneLandscape() {
      return s.phoneLandscape;
    },
    install() {
      if (installed) return;
      installed = true;
      // eslint-disable-next-line no-restricted-syntax -- predates the constant-per-query convention; see the follow-up to migrate it
      portraitQuery = window.matchMedia('(orientation: portrait)');
      phoneLandscapeQuery = window.matchMedia(PHONE_LANDSCAPE_QUERY);
      syncViewportImmediately();
      window.addEventListener('resize', syncViewportOnResize);
      phoneLandscapeQuery.addEventListener('change', syncPhoneLandscape);
      window.addEventListener('orientationchange', deferViewportSyncForRotation);
      screen.orientation?.addEventListener('change', deferViewportSyncForRotation);
      document.addEventListener('visibilitychange', syncViewportOnVisible);
    },
    dispose() {
      if (!installed) return;
      installed = false;
      window.removeEventListener('resize', syncViewportOnResize);
      phoneLandscapeQuery?.removeEventListener('change', syncPhoneLandscape);
      window.removeEventListener('orientationchange', deferViewportSyncForRotation);
      screen.orientation?.removeEventListener('change', deferViewportSyncForRotation);
      document.removeEventListener('visibilitychange', syncViewportOnVisible);
      if (rotationViewportSyncTimer !== undefined) {
        window.clearTimeout(rotationViewportSyncTimer);
        rotationViewportSyncTimer = undefined;
      }
      portraitQuery = null;
      phoneLandscapeQuery = null;
    },
  };
}

export const layoutState = createLayout();

// Installed at module load (not from a component) so the values are live before
// the first component renders, and so five consumers share one listener set.
if (browser) layoutState.install();
