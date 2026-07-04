import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Dev-only debug harness for the AI render timer animation. Gated by
// requireDevHarness() so it never ships to real users.
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
