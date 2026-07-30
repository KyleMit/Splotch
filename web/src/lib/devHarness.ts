import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

// The dev-only test harnesses under routes/dev/* — and the engine seam in
// lib/boot/devHarnessSeam.ts — must never ship to real users. They're available
// in `vite dev`, and in a production `vite preview` build only when
// PUBLIC_ENABLE_DEV_HARNESS=true (the e2e webServer sets it so Playwright can
// drive the real build). The Netlify deploy never sets it. This is the single
// definition of that gate; keep server-only imports out of this module so a
// client boot step can read it too.
export function devHarnessEnabled(): boolean {
  return dev || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
}

// Throws a 404 when the gate is closed; call it from every dev-harness
// `load`/request handler.
export function requireDevHarness() {
  if (!devHarnessEnabled()) throw error(404, 'Not found');
}
