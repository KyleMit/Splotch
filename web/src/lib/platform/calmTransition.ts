import { fade, type TransitionConfig } from 'svelte/transition';
import { CALM_FADE_MS } from '$lib/motionDurations';
import { prefersReducedMotion } from './reducedMotion';

// CSS reaches every declarative cue through `:root[data-reduce-motion]`, but a
// Svelte `transition:` runs its travel from JavaScript — the element never
// carries a transitioned property for a stylesheet to override. So a JS cue
// resolves the effective answer itself, and this is the one place that does it.

// Wraps a Svelte transition so the parent's calm answer swaps its travel for a
// short opacity fade. The answer is read when the transition starts, so a switch
// flipped mid-session reaches the very next reveal.
export function calm<P>(
  motion: (node: Element, params: P) => TransitionConfig,
  params: P
): (node: Element) => TransitionConfig {
  return (node) =>
    prefersReducedMotion() ? fade(node, { duration: CALM_FADE_MS }) : motion(node, params);
}
