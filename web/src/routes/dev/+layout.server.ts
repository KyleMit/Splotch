import { requireDevHarness } from '$lib/server/devHarness';
import type { LayoutServerLoad } from './$types';

// Gates every page under routes/dev/ in one place, so a new harness is dev-only
// by construction rather than by remembering to call requireDevHarness().
export const prerender = false;

export const load: LayoutServerLoad = () => {
  requireDevHarness();
  return {};
};
