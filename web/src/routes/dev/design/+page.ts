import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Dev-only living styleguide (ADR-0071): renders every design token and
// primitive from the real source of truth, in both themes, so visual-language
// changes can be reviewed in one place. Gated so it never ships to real users.
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
