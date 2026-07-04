import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Dev-only test harness for the imperative drawing engine. It mounts a real
// canvas through the real initDrawingCanvas() seam and exposes the engine's
// public API on window so the Playwright engine spec can drive it and read
// pixels back. Gated by requireDevHarness() so it never ships to real users.
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
