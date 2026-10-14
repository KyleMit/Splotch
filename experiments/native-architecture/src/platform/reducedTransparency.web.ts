import { useSyncExternalStore } from 'react';

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

function subscribe(changed: () => void) {
  const query = matchMedia(REDUCED_TRANSPARENCY_QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

const reducedTransparency = () => matchMedia(REDUCED_TRANSPARENCY_QUERY).matches;

// Whether the browser asks for solid surfaces in place of frosted ones, as shipping's
// prefers-reduced-transparency rules do.
export function useReducedTransparency() {
  return useSyncExternalStore(subscribe, reducedTransparency, () => false);
}
