import type { TransitionConfig } from 'svelte/transition';
import { isStrokeActive } from '$lib/drawing/engine';
import { FLYOUT_EXIT_MS } from '$lib/motionDurations';
import { prefersReducedMotion } from '$lib/platform/reducedMotion';
import { FLYOUT_EXIT_DROP_PX, FLYOUT_EXIT_SCALE, flyoutExitEase } from './flyoutMotion';

// The out-transition for the Brush and Stroke Width menus, which close by
// unmounting. It drops and shrinks the menu slightly as it fades. No exit
// at all while a stroke may be live (the rule .flyout-menu.motionless keeps
// for the entrance) or under reduced motion: the menu goes at once. Svelte
// marks an exiting element inert, so the menu stops taking input as it leaves.
export function flyoutExit(_node: Element): TransitionConfig {
  if (isStrokeActive() || prefersReducedMotion()) return { duration: 0 };
  return {
    duration: FLYOUT_EXIT_MS,
    easing: flyoutExitEase,
    css: (t) => {
      const u = 1 - t;
      const scale = 1 - (1 - FLYOUT_EXIT_SCALE) * u;
      return `opacity: ${t}; transform: translateY(${FLYOUT_EXIT_DROP_PX * u}px) scale(${scale});`;
    },
  };
}
