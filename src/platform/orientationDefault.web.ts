import { TABLET_MIN_SIDE_PX } from '../lib/breakpoints';
import type { OrientationChoice } from '../settings/orientation';

// The shipping web default (settings.svelte.ts defaultForceLandscapeOrientation):
// a browser at tablet size starts in Landscape, anything smaller in Portrait.
// The build's first-frame prerender has no window; its frame starts as a phone's does.
export function defaultOrientation(): OrientationChoice {
  if (typeof window === 'undefined') return 'portrait';
  return Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_SIDE_PX
    ? 'landscape'
    : 'portrait';
}
