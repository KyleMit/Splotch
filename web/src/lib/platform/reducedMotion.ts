// The one spelling of the reduced-motion query for JS call sites. A typo in a
// copy — `reduced-motion`, `reduce-motion` — evaluates to false and disables
// the accommodation on that surface alone, with nothing to catch it. CSS
// `@media (prefers-reduced-motion: reduce)` blocks are unaffected and stay.
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Pure memoization: one MediaQueryList shared by every caller, built on first
// use so the module stays safe to evaluate during SSR, where matchMedia is
// absent. A caller that needs the `change` event subscribes to its own list
// built from the constant above.
let query: MediaQueryList | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  query ??= matchMedia(REDUCED_MOTION_QUERY);
  return query.matches;
}
