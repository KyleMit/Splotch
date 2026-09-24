// The one home of the reduced-motion answer. The EFFECTIVE answer is the
// parent's stored preference resolved against the OS query, and it lives on
// <html> as REDUCE_MOTION_ATTRIBUTE: app.html's boot script stamps it before
// first paint, state/appearance.svelte.ts keeps it live on the routes that
// import it, and the boot script's own listener follows the OS everywhere else.
// CSS reads the live answer from `:root[data-reduce-motion]` and never from
// `@media (prefers-reduced-motion)` (reducedMotionCss.test.ts enforces it).
// Entrance and exit keyframes capture that answer when their cue starts, so
// changing the live answer cannot replay them on an element still mounted.

// The one spelling of the OS query for JS call sites. A typo in a copy —
// `reduced-motion`, `reduce-motion` — evaluates to false and disables the
// accommodation on that surface alone, with nothing to catch it.
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// app.html's boot script re-types the attribute name, the preference values,
// and the resolve rule; app.html.reduceMotion.test.ts runs it and fails on
// divergence.
export const REDUCE_MOTION_ATTRIBUTE = 'data-reduce-motion';

// An entrance or exit cue must keep the answer it started with. Changing a
// keyframe name on a mounted element restarts its CSS animation.
export const START_REDUCED_MOTION_ATTRIBUTE = 'data-start-reduced-motion';

export const EXPLICIT_REDUCE_MOTION_PREFERENCES = ['reduce', 'full'] as const;

export type ReduceMotionPreference = (typeof EXPLICIT_REDUCE_MOTION_PREFERENCES)[number] | 'system';

export const REDUCE_MOTION_DEFAULT: ReduceMotionPreference = 'system';

export function isReduceMotionPreference(value: unknown): value is ReduceMotionPreference {
  return value === 'reduce' || value === 'full' || value === 'system';
}

export function resolveReducedMotion(
  preference: ReduceMotionPreference,
  systemReduce: boolean
): boolean {
  if (preference === 'system') return systemReduce;
  return preference === 'reduce';
}

export function applyReducedMotion(reduced: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute(REDUCE_MOTION_ATTRIBUTE, reduced);
}

// Components that call this are imported by prerendered routes, which render
// them on the server where there is no document.
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute(REDUCE_MOTION_ATTRIBUTE);
}

export function stampMotionAtStart(node: Element): void {
  node.toggleAttribute(START_REDUCED_MOTION_ATTRIBUTE, prefersReducedMotion());
}

// For the caller that must react to the effective answer flipping mid-session.
// Observing the attribute rather than the OS query covers both triggers: an OS
// switch and the Settings toggle.
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  const observer = new MutationObserver(() => onChange(prefersReducedMotion()));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [REDUCE_MOTION_ATTRIBUTE],
  });
  return () => observer.disconnect();
}
