import { browser } from '$app/environment';
import type { Orientation } from '$lib/platform';
import { measureSafeAreaInsets, ZERO_INSETS, type SafeAreaInsets } from '$lib/platform/safeArea';

interface PaletteMeasurement {
  width: number;
  height: number;
  orientation: Orientation | null;
}

// Layout measurements published by the component that owns the element, so
// siblings can position against them without reaching across the DOM with a
// querySelector. That coupling tied callers to another component's CSS class
// names and forced a mount-time setTimeout to dodge layout races; reading the
// value reactively here removes both.
interface LayoutState {
  paletteMeasurement: PaletteMeasurement;
  orientation: Orientation;
  safeArea: SafeAreaInsets;
  orientationAngle: number;
  viewportWidth: number;
  viewportHeight: number;
}

const portraitQuery = browser ? window.matchMedia('(orientation: portrait)') : null;
// The physical-iPad profile for issue 977 improved with a 200 ms rotation-only
// hold. This bounds JS layout lag during orientation events; ordinary resizes
// continue publishing synchronously.
const ROTATION_VIEWPORT_SETTLE_MS = 200;
let rotationViewportSyncTimer: number | undefined;
let pendingPaletteMeasurement: PaletteMeasurement | undefined;

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

export const layout: LayoutState = $state({
  // Rendered size of the color palette bar. ActionsPanel sits just past its
  // width (+ gap) in landscape so it clears the palette, and the
  // action-button sizing math clears its height in portrait (the top bar).
  // The orientation tag prevents a dimension measured before rotation from
  // entering the other orientation's layout while ResizeObserver catches up.
  paletteMeasurement: { width: 0, height: 0, orientation: null },

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
});

export function publishPaletteMeasurement(width: number, height: number): void {
  // The rect comes from CSS layout, so its guard tag must use the matching
  // media-query orientation even when viewport geometry flips first.
  const measurement = { width, height, orientation: readCssOrientation() };
  if (rotationViewportSyncTimer !== undefined) {
    pendingPaletteMeasurement = measurement;
    return;
  }
  layout.paletteMeasurement = measurement;
}

export function clearPaletteMeasurement(): void {
  pendingPaletteMeasurement = undefined;
  layout.paletteMeasurement = { width: 0, height: 0, orientation: null };
}

function syncViewport() {
  const next = readViewportOrientation();
  layout.orientation = next;
  // Keep the [data-orientation] hook the head script stamped in sync on rotate.
  document.documentElement.dataset.orientation = readCssOrientation();
  // Per-field assign so equal re-measurements don't wake dependents.
  Object.assign(layout.safeArea, measureSafeAreaInsets());
  layout.orientationAngle = readOrientationAngle();
  layout.viewportWidth = window.innerWidth;
  layout.viewportHeight = window.innerHeight;
}

function flushPendingPaletteMeasurement() {
  if (pendingPaletteMeasurement === undefined) return;
  layout.paletteMeasurement = pendingPaletteMeasurement;
  pendingPaletteMeasurement = undefined;
}

function finishViewportRotation() {
  rotationViewportSyncTimer = undefined;
  syncViewport();
  flushPendingPaletteMeasurement();
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
  flushPendingPaletteMeasurement();
}

// Installed at module load (not from a component) so the values are live before
// the first component renders, and so five consumers share one listener set.
if (browser) {
  syncViewportImmediately();
  window.addEventListener('resize', syncViewportOnResize);
  window.addEventListener('orientationchange', deferViewportSyncForRotation);
  screen.orientation?.addEventListener('change', deferViewportSyncForRotation);
  // Neither event fires while the document is hidden, so a rotation while the
  // app is backgrounded would otherwise stay stale on re-entry. Re-measure when
  // the document becomes visible again (the native WebViews hide the document
  // while the app is backgrounded, so this covers Capacitor resume too).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncViewportImmediately();
  });
}
