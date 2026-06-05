import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

// Dev-only debug harness for the AI render timer animation. Must never ship to
// real users: available in `vite dev`, and in a production `vite preview` build
// only when PUBLIC_ENABLE_DEV_HARNESS=true (the e2e webServer sets it so
// Playwright can drive the real build). The Netlify deploy never sets it, so
// the route 404s in production.
export const prerender = false;

export function load() {
  if (!dev && env.PUBLIC_ENABLE_DEV_HARNESS !== 'true') throw error(404, 'Not found');
  return {};
}
