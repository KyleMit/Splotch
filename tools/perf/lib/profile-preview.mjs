// Build the production web bundle and serve it with `vite preview`, so the page-load gate
// (tools/page-load/run-lighthouse-ci.mjs) measures the minified bundle that actually ships, not
// the unminified dev server. Returns { base, stop }.
//
// spawnViteServer (tools/lib/vite-server.mjs) runs vite in a detached process
// group and kills the whole group on stop, so the preview server never orphans
// a grandchild and leaks the port. freePort() clears out this checkout's stale
// leftover server up front so every run serves the build it just produced, and
// refuses to start over another checkout's.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, run } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { freePort, spawnViteServer } from '../../lib/vite-server.mjs';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';

// A preview server left over from a previous build keeps the port and keeps
// serving the SvelteKit manifest it loaded at startup, so the next run
// silently measures the PREVIOUS build. The failure is invisible in a specific
// way: the served HTML names chunk files that no longer exist, the modules 404,
// and the route never hydrates — but because the drawing route is
// server-rendered, every selector still resolves and every button still exists.
// The run then measures dead markup and reports a plausible number.
//
// freePort() above is not sufficient on its own. Proving the served HTML and the
// chunks it names came from one build is the check that actually catches it.
export function entryModulePath(html) {
  return /\/_app\/immutable\/entry\/start\.[^"']+\.js/.exec(html ?? '')?.[0] ?? null;
}

// `build:cap` writes the native static export into the SAME directory the web
// build uses, so any native build silently replaces what the preview serves. The
// export is defined by what it DROPS, so the web-only files are the discriminator,
// read from the list the strip itself works from.
export function buildDirHoldsNativeExport(buildDir = join(ROOT, 'web', 'build')) {
  if (!existsSync(join(buildDir, 'index.html'))) return false;
  return WEB_ONLY_STATIC_FILES.every((file) => !existsSync(join(buildDir, file)));
}

// Resolving the entry proves the server is internally consistent. It does NOT
// prove the build is THIS checkout's — a preview server another worktree left on
// the port serves its own perfectly coherent build, and every check above passes
// against someone else's product. Observed on 2026-08-22, where port 4173 was held
// by a Codex worktree's preview for 85 minutes and the manifest check said fresh.
// Only the local build output can settle it.
async function assertServedManifestResolves(base) {
  const html = await fetch(base).then((response) => response.text());
  const entry = entryModulePath(html);
  if (!entry) {
    fail(`${base} served no entry module — the preview is not serving a built app`);
  }
  const module = await fetch(new URL(entry, base));
  if (!module.ok) {
    fail(
      `${base} is serving a stale manifest: it names ${entry}, which 404s. ` +
        'A run against it would measure un-hydrated server-rendered markup.'
    );
  }
  return entry;
}

const IMMUTABLE_REF = /\/_app\/immutable\/[A-Za-z0-9._\-/]+\.js/g;

// Which served files to compare. The entry alone is not identity: it is runtime
// plumbing that can be byte-identical while application chunks differ, so matching
// its filename proved nothing — a foreign URL plus this checkout's entry path
// passed. Everything the served page and the served entry actually reference is
// fetched and compared instead.
function referencedChunks(html, entryModule) {
  return [...new Set([...`${html}\n${entryModule}`.matchAll(IMMUTABLE_REF)].map(([ref]) => ref))];
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function localDigest(chunk, buildDir) {
  const path = join(buildDir, chunk);
  if (!existsSync(path)) return null;
  return sha256(readFileSync(path));
}

async function defaultFetchText(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`${url} returned ${response.status} — the served build is incomplete`);
  return response.text();
}

// Returns the first reason the served build is not this checkout's web build, or null.
export async function servedBuildFingerprintProblem(
  base,
  {
    // Test seams: a fake build and fetcher, because CI's browserless job runs no build
    // and a test that read the real web/build would pass only where one happens to exist.
    fetchText = defaultFetchText,
    buildDir = join(ROOT, 'web', 'build'),
  } = {}
) {
  if (buildDirHoldsNativeExport(buildDir)) {
    return (
      'web/build holds the native static export, not the web build — a native build ' +
      '(build:cap, ios:run:device, android:run) overwrote it, possibly while this server ' +
      'was already running. Run `npm run build` and restart the preview.'
    );
  }

  const html = await fetchText(base);
  const entry = entryModulePath(html);
  const entryModule = entry ? await fetchText(new URL(entry, base)) : '';
  const chunks = referencedChunks(html, entryModule);
  if (!chunks.length) {
    return `${base} references no application chunks — the preview is not serving a built app`;
  }

  for (const chunk of chunks) {
    const served = sha256(await fetchText(new URL(chunk, base)));
    const expected = localDigest(chunk, buildDir);
    if (!expected) {
      return (
        `${base} is serving ${chunk}, which this checkout's web/build does not contain — ` +
        'the port is held by another build. A run against it would measure a different ' +
        'product. Choose a free port rather than stopping a listener another session owns.'
      );
    }
    if (served !== expected) {
      return (
        `${base} is serving ${chunk} with different content from this checkout's web/build — ` +
        'the build was replaced or partially overwritten. A run against it would measure ' +
        'a different product.'
      );
    }
  }
  return null;
}

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle…');
    run('npm', ['run', 'build']);
  }

  await freePort(port);

  const base = `http://localhost:${port}/`;
  console.log('Starting preview server…');
  const { stop } = spawnViteServer(port, { command: 'preview' });

  try {
    await waitForUrl(base, timeout);
    const entry = await assertServedManifestResolves(base);
    const problem = await servedBuildFingerprintProblem(base);
    if (problem) fail(problem);
    console.log('Server ready, serving %s', entry);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop };
}
