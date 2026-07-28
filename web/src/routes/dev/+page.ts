import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Landing page listing the dev-only harnesses under routes/dev/*. Gated by
// requireDevHarness() like the harnesses themselves, so it never ships to real
// users (an ungated index would be a real route advertising them).
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
