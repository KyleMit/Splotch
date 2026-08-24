import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

// Server-rendered /dev/* routes need a runtime gate because their modules remain
// in the server build. Client seams use the compile-time __DEV_HARNESS__ literal
// instead so ordinary bundles can remove them entirely.
export function devHarnessEnabled(): boolean {
  return dev || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
}

// Throws a 404 when the gate is closed. Pages under `routes/dev/` are covered by
// `routes/dev/+layout.ts`; a future `+server.ts` request handler would need its
// own call because layout loads do not run for one.
export function requireDevHarness() {
  if (!devHarnessEnabled()) throw error(404, 'Not found');
}
