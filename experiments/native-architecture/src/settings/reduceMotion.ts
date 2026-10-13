import type { ReduceMotionPreference } from '../../../../web/src/lib/platform/reducedMotion';

export {
  isReduceMotionPreference,
  REDUCE_MOTION_DEFAULT,
  resolveReducedMotion,
  type ReduceMotionPreference,
} from '../../../../web/src/lib/platform/reducedMotion';

export const REDUCE_MOTION_LABEL = 'Reduce Motion';
export const REDUCE_MOTION_HELP = 'Calmer screens help children who are sensitive to movement';

// The shipping switch (setReducedMotion in web/src/lib/state/appearance.svelte.ts) shows the
// effective answer, so choosing what the device already asks for goes back to following it.
export function reduceMotionChoice(
  wanted: boolean,
  deviceReduced: boolean
): ReduceMotionPreference {
  if (deviceReduced === wanted) return 'system';
  return wanted ? 'reduce' : 'full';
}
