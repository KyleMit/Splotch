import { useMediaQuery } from './mediaQuery.web';

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

// Whether the browser asks for solid surfaces in place of frosted ones, as shipping's
// prefers-reduced-transparency rules do.
export function useReducedTransparency() {
  return useMediaQuery(REDUCED_TRANSPARENCY_QUERY);
}
