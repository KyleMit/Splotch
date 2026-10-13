import { TABLET_MIN_SIDE_PX } from '../../../../web/src/lib/breakpoints';
import type { OrientationChoice } from '../settings/orientation';

// The shipping web default (settings.svelte.ts defaultForceLandscapeOrientation):
// a browser at tablet size starts in Landscape, anything smaller in Portrait.
export function defaultOrientation(): OrientationChoice {
  return Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_SIDE_PX
    ? 'landscape'
    : 'portrait';
}
