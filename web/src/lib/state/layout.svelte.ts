import { browser } from '$app/environment';
import { measureSafeAreaInsets, ZERO_INSETS, type SafeAreaInsets } from '$lib/safeArea';

export type Orientation = 'portrait' | 'landscape';

// Layout measurements published by the component that owns the element, so
// siblings can position against them without reaching across the DOM with a
// querySelector. That coupling tied callers to another component's CSS class
// names and forced a mount-time setTimeout to dodge layout races; reading the
// value reactively here removes both.
interface LayoutState {
  paletteWidth: number;
  paletteHeight: number;
  orientation: Orientation;
  safeArea: SafeAreaInsets;
  viewportWidth: number;
  viewportHeight: number;
}

function readOrientation(): Orientation {
  // Prefer the value the inline head script (app.html) stamped on <html> before
  // first paint, so this store agrees with the pre-hydration document; fall back
  // to a live matchMedia read if the attribute is absent (e.g. unit tests).
  const stamped = document.documentElement.dataset.orientation;
  if (stamped === 'portrait' || stamped === 'landscape') return stamped;
  return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

export const layout: LayoutState = $state({
  // Rendered size of the color palette bar. ActionsPanel sits just past its
  // width (paletteWidth + gap) in landscape so it clears the palette, and the
  // action-button sizing math clears its height in portrait (the top bar).
  // 0 until the palette has measured itself, so dependents settle once it
  // lays out.
  paletteWidth: 0,
  paletteHeight: 0,

  // Viewport orientation and the measured env(safe-area-inset-*) values, kept
  // fresh by the single resize/orientationchange listener pair below so
  // components can $derive off them instead of each wiring its own listeners.
  // Seeded from the head-script stamp on the client so JS-driven consumers never
  // see the SSR 'landscape' default; stays 'landscape' during prerender (no DOM).
  orientation: browser ? readOrientation() : 'landscape',

  safeArea: { ...ZERO_INSETS },

  // Viewport dimensions in CSS px, for JS-side layout math (e.g. the Parent
  // Center's dynamic Button Size ceiling). 0 during prerender; synced from
  // module load on the client.
  viewportWidth: 0,
  viewportHeight: 0,
});

function syncViewport() {
  const next = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  layout.orientation = next;
  // Keep the [data-orientation] hook the head script stamped in sync on rotate.
  document.documentElement.dataset.orientation = next;
  // Per-field assign so equal re-measurements don't wake dependents.
  Object.assign(layout.safeArea, measureSafeAreaInsets());
  layout.viewportWidth = window.innerWidth;
  layout.viewportHeight = window.innerHeight;
}

// Installed at module load (not from a component) so the values are live before
// the first component renders, and so five consumers share one listener pair.
if (browser) {
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
}
