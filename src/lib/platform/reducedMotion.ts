// app.html's boot script re-types the attribute name, the preference values,
// and the resolve rule; app.html.reduceMotion.test.ts runs it and fails on
// divergence.
export const REDUCE_MOTION_ATTRIBUTE = 'data-reduce-motion';

export const EXPLICIT_REDUCE_MOTION_PREFERENCES = ['reduce', 'full'] as const;

export type ReduceMotionPreference = (typeof EXPLICIT_REDUCE_MOTION_PREFERENCES)[number] | 'system';

export const REDUCE_MOTION_DEFAULT: ReduceMotionPreference = 'system';

export function isReduceMotionPreference(value: unknown): value is ReduceMotionPreference {
  return (
    value === 'system' ||
    EXPLICIT_REDUCE_MOTION_PREFERENCES.some((preference) => preference === value)
  );
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
