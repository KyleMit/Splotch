import { requireDevHarness } from '$lib/devHarness';
import type { PageLoad } from './$types';

// Dev-only test harness for the imperative drawing engine. It mounts a real
// canvas through the real initDrawingCanvas() seam and exposes the engine's
// public API on window so the Playwright engine spec can drive it and read
// pixels back. Gated by requireDevHarness() so it never ships to real users.
export const prerender = false;

// Client-only: the harness mounts a real canvas and puts the engine API on
// `window`, so there is nothing to server-render (and SSR would touch `window`).
// Under `vite build && vite preview` the route already falls back to the SPA
// shell; ssr=false makes `vite dev` behave the same instead of 500-ing on SSR.
export const ssr = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
