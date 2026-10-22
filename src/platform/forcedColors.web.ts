import { useSyncExternalStore } from 'react';

const FORCED_COLORS_QUERY = '(forced-colors: active)';

function subscribe(changed: () => void) {
  const query = matchMedia(FORCED_COLORS_QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

const forcedColors = () => matchMedia(FORCED_COLORS_QUERY).matches;

// Whether the browser paints with the reader's system colours, which shipping's forced-colors rules
// answer. The browser recolours text, borders and backgrounds itself but leaves an inline SVG's
// paint alone, so a mark drawn as a path asks for the system colours here.
export function useForcedColors() {
  return useSyncExternalStore(subscribe, forcedColors, () => false);
}
