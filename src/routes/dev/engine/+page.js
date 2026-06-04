import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Dev-only test harness for the imperative drawing engine. It mounts a real
// canvas through the real initDrawingCanvas() seam and exposes the engine's
// public API on window so the Playwright engine spec can drive it and read
// pixels back. Must never ship: excluded from the prerendered build, 404s live.
export const prerender = false;

export function load() {
  if (!dev) throw error(404, 'Not found');
  return {};
}
