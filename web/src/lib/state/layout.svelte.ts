import { browser } from '$app/environment';
import { PHONE_LANDSCAPE_QUERY } from '$lib/breakpoints';
import type { Orientation } from '$lib/platform';
import { measureSafeAreaInsets, ZERO_INSETS, type SafeAreaInsets } from '$lib/platform/safeArea';

// Viewport facts JS-side layout consumers derive from — the Button Size
// slider's ceiling, the Install Banner, the Notch Band, the engine's edge-swipe
// bands. Element geometry is not published here: the Color Palette's extents
// are CSS declarations (app.css --palette-landscape-width /
// --palette-portrait-height) that the Actions Panel reads in the stylesheet.
interface LayoutState {
  orientation: Orientation;
  safeArea: SafeAreaInsets;
  orientationAngle: number;
  viewportWidth: number;
  viewportHeight: number;
  phoneLandscape: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- predates the constant-per-query convention; see the follow-up to migrate it
const portraitQuery = browser ? window.matchMedia('(orientation: portrait)') : null;
const phoneLandscapeQuery = browser ? window.matchMedia(PHONE_LANDSCAPE_QUERY) : null;
// The physical-iPad profile for issue 977 improved with a 200 ms rotation-only
// hold. This bounds JS layout lag during orientation events (ADR-0142 scores
// the deferred work in the post-action frame window); ordinary resizes
// continue publishing synchronously.
const ROTATION_VIEWPORT_SETTLE_MS = 200;
let rotationViewportSyncTimer: number | undefined;

function readViewportOrientation(): Orientation {
  if (window.innerWidth > window.innerHeight) return 'landscape';
  if (window.innerHeight > window.innerWidth) return 'portrait';
  return readCssOrientation();
}

function readCssOrientation(): Orientation {
  return (portraitQuery?.matches ?? false) ? 'portrait' : 'landscape';
}

function readOrientationAngle(): number {
  const angle = screen.orientation?.angle;
  return typeof angle === 'number' ? angle : 0;
}

function readOrientation(): Orientation {
  // Prefer the value the inline head script (app.html) stamped on <html> before
  // first paint, so this store agrees with the pre-hydration document; fall back
  // to a live matchMedia read if the attribute is absent (e.g. unit tests).
  const stamped = document.documentElement.dataset.orientation;
  if (stamped === 'portrait' || stamped === 'landscape') return stamped;
  return readCssOrientation();
}

export const layoutState: LayoutState = $state({
  // Viewport orientation and the measured env(safe-area-inset-*) values, kept
  // fresh by the single shared listener set below (resize, legacy and standard
  // orientation changes, and visibility re-entry) so components can $derive off them
  // instead of each wiring its own listeners.
  // Seeded from the head-script stamp on the client so JS-driven consumers never
  // see the SSR 'landscape' default; stays 'landscape' during prerender (no DOM).
  orientation: browser ? readOrientation() : 'landscape',

  safeArea: { ...ZERO_INSETS },

  // screen.orientation.angle, or 0 where the API is absent. Distinguishes the
  // two landscape rotations, which the insets alone cannot on iOS — the Notch
  // Band needs it to know which side the cutout is on (lib/platform/notchBand).
  orientationAngle: browser ? readOrientationAngle() : 0,

  // Viewport dimensions in CSS px, for JS-side layout math (e.g. the dynamic
  // Button Size ceiling in Settings). 0 during prerender; synced from
  // module load on the client.
  viewportWidth: 0,
  viewportHeight: 0,
  phoneLandscape: phoneLandscapeQuery?.matches ?? false,
});

function syncViewport() {
  const next = readViewportOrientation();
  layoutState.orientation = next;
  // Keep the [data-orientation] hook the head script stamped in sync on rotate.
  document.documentElement.dataset.orientation = readCssOrientation();
  // Per-field assign so equal re-measurements don't wake dependents.
  Object.assign(layoutState.safeArea, measureSafeAreaInsets());
  layoutState.orientationAngle = readOrientationAngle();
  layoutState.viewportWidth = window.innerWidth;
  layoutState.viewportHeight = window.innerHeight;
  syncPhoneLandscape();
}

function syncPhoneLandscape() {
  layoutState.phoneLandscape = phoneLandscapeQuery?.matches ?? false;
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

function syncViewportOnResize() {
  if (rotationViewportSyncTimer === undefined) syncViewportImmediately();
}

function syncViewportImmediately() {
  if (rotationViewportSyncTimer !== undefined) {
    window.clearTimeout(rotationViewportSyncTimer);
    rotationViewportSyncTimer = undefined;
  }
  syncViewport();
}

// Installed at module load (not from a component) so the values are live before
// the first component renders, and so five consumers share one listener set.
if (browser) {
  syncViewportImmediately();
  window.addEventListener('resize', syncViewportOnResize);
  phoneLandscapeQuery?.addEventListener('change', syncPhoneLandscape);
  window.addEventListener('orientationchange', deferViewportSyncForRotation);
  screen.orientation?.addEventListener('change', deferViewportSyncForRotation);
  // Hidden documents can miss rotations, so re-measure on visibility re-entry.
  // Android WebViews can remain visible while backgrounded; their resume-time
  // resize already reaches syncViewportOnResize, without a separate resume listener.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncViewportImmediately();
  });
}
