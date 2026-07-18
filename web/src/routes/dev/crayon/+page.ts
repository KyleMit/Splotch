import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Dev-only A/B harness for the crayon brush (ADR-0065). It renders the crayon's
// canonical reference scenes (single stroke, same-colour buildup, scribble fill)
// through the real strokeOps renderer over the real paper texture, with live
// sliders for the tooth-coverage variant params. Doubles as the deterministic
// screenshot source for the reference/vision-judge loop. Gated by
// requireDevHarness() so it never ships to real users.
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
