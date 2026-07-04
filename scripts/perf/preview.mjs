// Build the production web bundle (with the engine PERF_MARKS baked in, since
// PERF_MARKS=true is inherited from the npm script's env) and serve it with
// `vite preview`, so the harness profiles the minified bundle that actually
// ships — not the unminified dev server. Returns { base, stop }.
//
// spawnViteServer (scripts/lib/vite-server.mjs) runs vite in a detached process
// group and kills the whole group on stop, so the preview server never orphans
// a grandchild and leaks the port. freePort() clears out any stale leftover
// server up front so every run serves the build it just produced.

import { run, sleep, waitForUrl } from '../lib/utils.mjs';
import { spawnViteServer, freePort } from '../lib/vite-server.mjs';

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle (PERF_MARKS=%s)…', process.env.PERF_MARKS ?? 'unset');
    run('npm', ['run', 'build']);
  }

  freePort(port);
  await sleep(500);

  const base = `http://localhost:${port}/`;
  console.log('Starting preview server…');
  const { stop } = spawnViteServer(port, {}, 'preview');

  try {
    await waitForUrl(base, timeout);
  } catch (err) {
    stop();
    throw err;
  }
  console.log('Server ready.');
  return { base, stop };
}
