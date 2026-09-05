// Build the production web bundle (with the engine PERF_MARKS baked in, since
// PERF_MARKS=true is inherited from the npm script's env) and serve it with
// `vite preview`, so the harness profiles the minified bundle that actually
// ships — not the unminified dev server. Returns { base, stop }.
//
// spawnViteServer (tools/lib/vite-server.mjs) runs vite in a detached process
// group and kills the whole group on stop, so the preview server never orphans
// a grandchild and leaks the port. freePort() clears out any stale leftover
// server up front so every run serves the build it just produced.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, run, sleep } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { foreignPortListeners, freePort, spawnViteServer } from '../../lib/vite-server.mjs';
import { buildDirHoldsNativeExport } from './build-variant.mjs';
import { stampedBuildCommit } from './build-provenance.mjs';

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

export function loadedPageEntryProblem(expectedEntry, scriptSources) {
  const loadedEntry = entryModulePath(scriptSources.join('\n'));
  if (!loadedEntry) return 'the loaded page exposes no SvelteKit entry module';
  if (loadedEntry === expectedEntry) return null;
  return `the loaded page uses ${loadedEntry}, but the preview serves ${expectedEntry}`;
}

// Resolving the entry proves the server is internally consistent. It does NOT
// prove the build is THIS checkout's — a preview server another worktree left on
// the port serves its own perfectly coherent build, and every check above passes
// against someone else's product. Observed on 2026-08-22, where port 4173 was held
// by a Codex worktree's preview for 85 minutes and the manifest check said fresh.
// Only the local build output can settle it.
// Valid against ANY server, including the externally-served historical build that
// `--url=` exists for, so this is the half of the check a `--url` capture can also
// run. It cannot say whose build it is — only that the build is self-consistent.
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
        'A capture against it would measure un-hydrated server-rendered markup.'
    );
  }
  return entry;
}

// `allowForeignBuild` exists for the one documented case that cannot satisfy
// identity: `--url=` pointed at an externally served HISTORICAL build, which by
// definition is not in this checkout. Everything else — above all the shared
// preview every campaign cell points `--url` at — must prove identity, or the
// guard covers only the path nobody uses.
const IMMUTABLE_REF = /\/_app\/immutable\/[A-Za-z0-9._\-/]+\.js/g;

// Which served files to compare. The entry alone is not identity: it is runtime
// plumbing that can be byte-identical while application chunks differ, so matching
// its filename proved nothing — a foreign URL plus this checkout's entry path
// passed. Everything the served page and the served entry actually reference is
// fetched and compared instead.
function referencedChunks(html, entryModule) {
  return [...new Set([...`${html}\n${entryModule}`.matchAll(IMMUTABLE_REF)].map(([ref]) => ref))];
}

function localDigest(chunk, buildDir) {
  const path = join(buildDir, chunk);
  if (!existsSync(path)) return null;
  return sha256(readFileSync(path));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// What the served page and its entry actually reference, fetched and digested.
// This is the evidence the fingerprint check walks; keeping it a value lets the
// same pass both verify the build and record its identity instead of
// discarding what it just proved.
async function servedChunkDigests(base, fetchText) {
  const html = await fetchText(base);
  const entry = entryModulePath(html);
  const entryModule = entry ? await fetchText(new URL(entry, base)) : '';
  const chunks = referencedChunks(html, entryModule);
  const digests = [];
  for (const chunk of chunks) {
    digests.push([chunk, sha256(await fetchText(new URL(chunk, base)))]);
  }
  return { entry, digests };
}

// Returns the first served file whose bytes are not this checkout's, or null.
// Injected fetcher so the regression needs no network.
export async function servedBuildFingerprintProblem(
  base,
  {
    allowForeignBuild = false,
    nativeApp = false,
    fetchText = defaultFetchText,
    // Injected so a unit test can stand up a fake build rather than depending on
    // one existing — CI's unit job does not run a build, and a test that reads
    // web/build passes only on a machine that happens to have one.
    buildDir = join(ROOT, 'web', 'build'),
  } = {}
) {
  if (allowForeignBuild) return null;
  const nativeBuild = buildDirHoldsNativeExport(buildDir);
  if (nativeBuild && !nativeApp) {
    return (
      'web/build holds the native static export, not the web build — a native build ' +
      '(build:cap, ios:run:device, android:run) overwrote it, possibly while this server ' +
      'was already running. A capture against it hangs rather than failing. ' +
      'Run `npm run perf:build` and restart the preview.'
    );
  }

  if (nativeApp && !nativeBuild) {
    return (
      'Native capture requires the native static export. Run `npm run perf:build:cap`, ' +
      'then restart the preview against that export. `perf:serve` serves web builds; ' +
      'see the native preview recipe in docs/PROFILING-CAMPAIGNS.md.'
    );
  }

  const { digests } = await servedChunkDigests(base, fetchText);
  if (!digests.length) {
    return `${base} references no application chunks — the preview is not serving a built app`;
  }

  for (const [chunk, served] of digests) {
    const expected = localDigest(chunk, buildDir);
    if (!expected) {
      return (
        `${base} is serving ${chunk}, which this checkout's web/build does not contain — ` +
        'the port is held by another build. A capture against it would measure a different ' +
        'product. Choose a free port rather than stopping a listener another session owns.'
      );
    }
    if (served !== expected) {
      return (
        `${base} is serving ${chunk} with different content from this checkout's web/build — ` +
        'the build was replaced or partially overwritten. A capture against it would measure ' +
        'a different product.'
      );
    }
  }
  return null;
}

async function defaultFetchText(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`${url} returned ${response.status} — the served build is incomplete`);
  return response.text();
}

// The identity the fingerprint check just proved (or, for a deliberately
// foreign build, at least observed), as a value an artifact can carry instead
// of the guard discarding it: the entry chunk name, one digest over every
// served application chunk, and — only when the served bytes were verified as
// THIS checkout's build — the commit the BUILD stamped when it ran
// (postperf:build). Capture-time HEAD cannot serve: web/build outlives the
// commit it was built from, so served and local bytes agree while HEAD has
// moved on, and the artifact would claim a commit whose product was never
// measured. A build with no stamp, or one from a dirty tree, records a null
// productCommit; a foreign build records null because HEAD says nothing about
// a build that is not this checkout's. The buildDigest still identifies the
// served bytes either way, which is what lets two same-mode captures prove
// they measured the same arm.
export async function servedBuildBinding(
  base,
  {
    verifiedAgainstCheckout,
    fetchText = defaultFetchText,
    resolveProductCommit = stampedBuildCommit,
  } = {}
) {
  const { entry, digests } = await servedChunkDigests(base, fetchText);
  return {
    buildEntry: entry,
    buildDigest: digests.length
      ? sha256(digests.map(([chunk, digest]) => `${chunk} ${digest}`).join('\n'))
      : null,
    productCommit: verifiedAgainstCheckout ? resolveProductCommit() : null,
  };
}

export async function assertServedBuildIsFresh(
  base,
  { allowForeignBuild = false, nativeApp = false } = {}
) {
  await assertServedManifestResolves(base);
  const problem = await servedBuildFingerprintProblem(base, { allowForeignBuild, nativeApp });
  if (problem) fail(problem);
  return servedBuildBinding(base, { verifiedAgainstCheckout: !allowForeignBuild });
}

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle (PERF_MARKS=%s)…', process.env.PERF_MARKS ?? 'unset');
    run('npm', ['run', 'build']);
  }

  // freePort SIGTERMs every listener on the port. That is correct for this
  // session's own leftovers and wrong for another checkout's server — which it
  // killed before the identity assertion below could report which build was there,
  // while the assertion's own message told the reader to choose a free port rather
  // than stop it.
  const foreign = foreignPortListeners(port, ROOT);
  if (foreign.length) {
    fail(
      `port ${port} is held by a listener outside this checkout (pid ${foreign.join(', ')}). ` +
        "Choose a free port — stopping it would take down another session's server, and " +
        'capturing against it would measure a different product.'
    );
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
    const servedBuild = await assertServedBuildIsFresh(base);
    console.log('Server ready, serving %s', servedBuild.buildEntry);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop };
}
