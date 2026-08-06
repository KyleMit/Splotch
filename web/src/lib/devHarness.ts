import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

// Server-rendered /dev/* routes need a runtime gate because their modules remain
// in the server build. Client seams use the compile-time __DEV_HARNESS__ literal
// instead so ordinary bundles can remove them entirely.
function devHarnessEnabled(): boolean {
  return dev || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
}

// Throws a 404 when the gate is closed. Pages under `routes/dev/` are covered by
// `routes/dev/+layout.ts`; a `+server.ts` request handler needs its own call,
// since layout loads don't run for one (see
// `routes/dev/ai-timer/artifacts/[name]/+server.ts`).
export function requireDevHarness() {
  if (!devHarnessEnabled()) throw error(404, 'Not found');
}
