import { requireDevHarness } from '$lib/devHarness';
import type { LayoutLoad } from './$types';

// Gates every page under routes/dev/ in one place, so a new harness is dev-only
// by construction rather than by remembering to call requireDevHarness().
export const prerender = false;

export const load: LayoutLoad = () => {
  requireDevHarness();
  return {};
};
