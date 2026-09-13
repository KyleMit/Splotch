import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

// Server-rendered /dev/* routes need a runtime gate because their modules remain
// in the server build. Client seams use the compile-time __DEV_HARNESS__ literal
// instead so ordinary bundles can remove them entirely.
//
// Server-only on purpose: one client import of `$env/dynamic/public` makes every
// prerendered page's boot script await a function-served `/_app/env.js` before
// any app code runs, including the pre-hydration drawing path (ADR-0072).
// `tools/check-bundle-budgets.mjs` fails the build if that import returns. The
// flag stays in the public module because `$env/dynamic/private` excludes
// `PUBLIC_`-prefixed variables.
export function devHarnessEnabled(): boolean {
  return dev || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
}

// Throws a 404 when the gate is closed. Pages under `routes/dev/` are covered by
// `routes/dev/+layout.server.ts`; a `+server.ts` request handler needs its own
// call because layout loads do not run for one.
export function requireDevHarness() {
  if (!devHarnessEnabled()) throw error(404, 'Not found');
}
