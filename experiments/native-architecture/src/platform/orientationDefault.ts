import type { OrientationChoice } from '../settings/orientation';

// The shipping app defaults to Landscape only at tablet size, and the native
// shells never lock a tablet (useOrientationLockApplies), so Portrait is the
// shipping default everywhere a native choice takes effect.
export function defaultOrientation(): OrientationChoice {
  return 'portrait';
}
