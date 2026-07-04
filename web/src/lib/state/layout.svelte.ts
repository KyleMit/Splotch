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
  orientation: Orientation;
  safeArea: SafeAreaInsets;
}

export const layout: LayoutState = $state({
  // Rendered width of the color palette bar. ActionsPanel sits just past it
  // (paletteWidth + gap) in landscape so it clears the palette. 0 until the
  // palette has measured itself, so dependents settle once it lays out.
  paletteWidth: 0,

  // Viewport orientation and the measured env(safe-area-inset-*) values, kept
  // fresh by the single resize/orientationchange listener pair below so
  // components can $derive off them instead of each wiring its own listeners.
  orientation: 'landscape',

  safeArea: { ...ZERO_INSETS },
});

function syncViewport() {
  layout.orientation = window.matchMedia('(orientation: portrait)').matches
    ? 'portrait'
    : 'landscape';
  // Per-field assign so equal re-measurements don't wake dependents.
  Object.assign(layout.safeArea, measureSafeAreaInsets());
}

// Installed at module load (not from a component) so the values are live before
// the first component renders, and so five consumers share one listener pair.
if (browser) {
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
}
