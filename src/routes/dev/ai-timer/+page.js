import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Dev-only debug harness for the AI render timer animation. It must never ship,
// so it's excluded from the pre-rendered production build and 404s if hit live.
export const prerender = false;

export function load() {
  if (!dev) throw error(404, 'Not found');
  return {};
}
