import { useCallback, useSyncExternalStore } from 'react';

// Whether a CSS media query matches, following its changes.
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (changed: () => void) => {
      const list = matchMedia(query);
      list.addEventListener('change', changed);
      return () => list.removeEventListener('change', changed);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false
  );
}
