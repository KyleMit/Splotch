// Build the production web bundle (with the engine PERF_MARKS baked in, since
// PERF_MARKS=true is inherited from the npm script's env) and serve it with
// `vite preview`, so the harness profiles the minified bundle that actually
// ships — not the unminified dev server. Returns { base, stop }.
//
// spawnViteServer (tools/lib/vite-server.mjs) runs vite in a detached process
// group and kills the whole group on stop, so the preview server never orphans
// a grandchild and leaks the port. freePort() clears out any stale leftover
// server up front so every run serves the build it just produced.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, run, sleep } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { spawnViteServer, freePort } from '../../lib/vite-server.mjs';

// A preview server left over from a previous build keeps the port and keeps
// serving the SvelteKit manifest it loaded at startup, so the next capture
// silently measures the PREVIOUS build. The failure is invisible in a specific
// way: the served HTML names chunk files that no longer exist, the modules 404,
// and the route never hydrates — but because the drawing route is
// server-rendered, every selector still resolves and every button still exists.
// The capture then measures dead markup and reports a plausible number.
//
// freePort() above is supposed to prevent this, and the campaign learned that it
// is not sufficient on its own. Proving the served HTML and the chunks it names
// came from one build is the check that actually catches it.
export function entryModulePath(html) {
  return /\/_app\/immutable\/entry\/start\.[^"']+\.js/.exec(html ?? '')?.[0] ?? null;
}

// Resolving the entry proves the server is internally consistent. It does NOT
// prove the build is THIS checkout's — a preview server another worktree left on
// the port serves its own perfectly coherent build, and every check above passes
// against someone else's product. Observed on 2026-08-22, where port 4173 was held
// by a Codex worktree's preview for 85 minutes and the manifest check said fresh.
// Only the local build output can settle it.
function localBuildHasEntry(entry) {
  return existsSync(join(ROOT, 'web', 'build', entry));
}

export async function assertServedBuildIsFresh(base) {
  const html = await fetch(base).then((response) => response.text());
  const entry = entryModulePath(html);
  if (!entry) {
    fail(`${base} served no entry module — the preview is not serving a built app`);
  }
  const module = await fetch(new URL(entry, base));
  if (!module.ok) {
    fail(
      `${base} is serving a stale manifest: it names ${entry}, which 404s. ` +
        'A capture against it would measure un-hydrated server-rendered markup.'
    );
  }
  if (!localBuildHasEntry(entry)) {
    fail(
      `${base} is serving ${entry}, which this checkout's web/build does not contain — ` +
        'the port is held by another build. A capture against it would measure a different ' +
        'product. Choose a free port rather than stopping a listener another session owns.'
    );
  }
  return entry;
}

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle (PERF_MARKS=%s)…', process.env.PERF_MARKS ?? 'unset');
    run('npm', ['run', 'build']);
  }

  freePort(port);
  await sleep(500);

  const base = `http://localhost:${port}/`;
  console.log('Starting preview server…');
  const { stop } = spawnViteServer(port, { command: 'preview' });

  try {
    await waitForUrl(base, timeout);
  } catch (err) {
    stop();
    throw err;
  }
  try {
    const entry = await assertServedBuildIsFresh(base);
    console.log('Server ready, serving %s', entry);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop };
}
