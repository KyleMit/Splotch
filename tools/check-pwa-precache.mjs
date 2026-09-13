import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { filesRecursively } from './lib/filesystem.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_DIR = join(ROOT, 'web/.svelte-kit/output/client');
const SW_PATH = join(CLIENT_DIR, 'sw.js');
const PRERENDERED_APP_SHELL_PATH = join(
  ROOT,
  'web/.svelte-kit/output/prerendered/pages/index.html'
);
const STATIC_COLORING_DIR = join(ROOT, 'web/static/coloring');
const RESPONSIVE_TIER_PATTERN = /^max-\d+px$/;
const RUNTIME_GENERATED_PRECACHE_URLS = new Set(['_app/env.js']);
// The prerendered home page, precached under the build-unique URL
// web/src/lib/pwa/appShellRoute.ts builds; the test drift-guards the two.
export const APP_SHELL_PRECACHE_URL_PATTERN = /^\/\?app-shell-build=[^&]+$/;
const SERVED_ONLY_ASSET_URLS = new Set(['large-image.png']);
// Leaves room for ordinary app growth while rejecting a second bundled coloring book.
export const MAX_PWA_PRECACHE_BYTES = 12_000_000;

export function precacheUrlsFromSource(source) {
  return [...source.matchAll(/\{url:("(?:\\.|[^"\\])*"),revision:/g)].map((match) =>
    JSON.parse(match[1])
  );
}

// The navigation route's fallback plugin compiles the shell URL into its callbacks
// as a string literal. The timeout callback answers a stalled launch and the error
// callback an offline one, so each must look up the shell on its own.
export const APP_SHELL_FALLBACK_CALLBACKS = ['cachedResponseWillBeUsed', 'handlerDidError'];

// Each callback name, then its own body up to the next function-valued property in
// any form, then the lookup. A nested function property inside a callback body ends
// the scan early, so the check then reports the lookup missing rather than passing.
const FUNCTION_PROPERTY_START = String.raw`[\w$]+:(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)`;
const APP_SHELL_FALLBACK_LOOKUP_PATTERN = new RegExp(
  String.raw`(${APP_SHELL_FALLBACK_CALLBACKS.join('|')}):async function\b` +
    String.raw`(?:(?!${FUNCTION_PROPERTY_START})[^])*?` +
    String.raw`caches\.match\(("\/\?app-shell-build=(?:\\.|[^"\\])*")\)`,
  'g'
);

export function appShellFallbackLookupsFromSource(source) {
  return [...source.matchAll(APP_SHELL_FALLBACK_LOOKUP_PATTERN)].map((match) => ({
    callback: match[1],
    url: JSON.parse(match[2]),
  }));
}

export function pwaPrecacheProblems({
  precacheUrls,
  appShellFallbackLookups,
  precacheBytes,
  responsiveAssetUrls,
  coloringManifest,
  maxPrecacheBytes = MAX_PWA_PRECACHE_BYTES,
}) {
  const problems = [];
  if (!precacheUrls.includes('_app/env.js')) {
    problems.push('SvelteKit runtime environment module is missing from the PWA precache');
  }
  const appShellUrls = precacheUrls.filter((url) => APP_SHELL_PRECACHE_URL_PATTERN.test(url));
  if (appShellUrls.length !== 1) {
    problems.push(
      `Expected one build-matched app shell in the PWA precache, found ${appShellUrls.length}`
    );
  } else {
    if (precacheUrls[0] !== appShellUrls[0]) {
      problems.push(
        'The app shell must be the first precache entry so a deploy mid-install fails the install'
      );
    }
    for (const callback of APP_SHELL_FALLBACK_CALLBACKS) {
      const lookups = appShellFallbackLookups.filter((lookup) => lookup.callback === callback);
      if (lookups.length !== 1 || lookups[0].url !== appShellUrls[0]) {
        problems.push(
          `The navigation fallback's ${callback} does not look up the precached app shell ${appShellUrls[0]}`
        );
      }
    }
  }
  const responsivePrecacheUrls = precacheUrls.filter((url) => /^coloring\/max-\d+px\//.test(url));
  if (responsivePrecacheUrls.length) {
    problems.push(
      `${responsivePrecacheUrls.length} responsive coloring derivatives remain in the PWA precache`
    );
  }
  const servedOnlyPrecacheUrls = precacheUrls.filter((url) => SERVED_ONLY_ASSET_URLS.has(url));
  if (servedOnlyPrecacheUrls.length) {
    problems.push(
      `Assets served but never fetched by the application remain in the PWA precache: ${servedOnlyPrecacheUrls.join(', ')}`
    );
  }

  const precached = new Set(precacheUrls);
  const starterBookId = coloringManifest?.starterBookId;
  if (!starterBookId) {
    problems.push('Coloring-pack manifest is missing from the PWA precache');
  }
  const unexpectedColoringUrls = starterBookId
    ? precacheUrls.filter((url) => {
        const match = /^coloring\/([^/]+)\/.+\.(?:webp|svg)$/.exec(url);
        return !!match && !RESPONSIVE_TIER_PATTERN.test(match[1]) && match[1] !== starterBookId;
      })
    : [];
  if (unexpectedColoringUrls.length) {
    problems.push(
      `${unexpectedColoringUrls.length} downloadable coloring assets remain in the PWA precache`
    );
  }
  const starterFiles =
    coloringManifest?.books.find((book) => book.id === starterBookId)?.variants?.full?.files ?? [];
  const missingStarterFiles = starterFiles
    .map((file) => file.path.slice(1))
    .filter((url) => !precached.has(url));
  if (missingStarterFiles.length) {
    problems.push(
      `${missingStarterFiles.length} starter coloring assets are missing from the PWA precache: ${missingStarterFiles[0]}`
    );
  }
  const missingCanonicalUrls = responsiveAssetUrls
    .map((url) => url.replace(/^coloring\/max-\d+px\//, 'coloring/'))
    .filter((url) => !starterBookId || url.startsWith(`coloring/${starterBookId}/`))
    .filter((url) => !precached.has(url));
  if (missingCanonicalUrls.length) {
    problems.push(
      `${missingCanonicalUrls.length} responsive coloring derivatives lack a precached canonical fallback: ${missingCanonicalUrls[0]}`
    );
  }
  if (precacheBytes > maxPrecacheBytes) {
    problems.push(
      `PWA precache is ${precacheBytes} bytes, above the ${maxPrecacheBytes}-byte budget`
    );
  }
  return problems;
}

export async function checkPwaPrecache({
  clientDir = CLIENT_DIR,
  swPath = SW_PATH,
  appShellPath = PRERENDERED_APP_SHELL_PATH,
  staticColoringDir = STATIC_COLORING_DIR,
  log = console.log,
} = {}) {
  if (!existsSync(swPath)) throw new Error(`Service worker does not exist: ${swPath}`);
  const serviceWorkerSource = readFileSync(swPath, 'utf8');
  const precacheUrls = precacheUrlsFromSource(serviceWorkerSource);
  if (!precacheUrls.length) throw new Error(`No Workbox precache manifest found in ${swPath}`);

  const responsiveTierDirectories = readdirSync(staticColoringDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RESPONSIVE_TIER_PATTERN.test(entry.name))
    .map((entry) => join(staticColoringDir, entry.name));
  const responsiveAssetUrls = responsiveTierDirectories.flatMap((directory) =>
    filesRecursively(directory).map((path) =>
      ['coloring', relative(staticColoringDir, path).split(sep).join('/')].join('/')
    )
  );
  const precacheBytes = precacheUrls.reduce((total, url) => {
    const path = APP_SHELL_PRECACHE_URL_PATTERN.test(url) ? appShellPath : join(clientDir, url);
    if (!existsSync(path)) {
      if (RUNTIME_GENERATED_PRECACHE_URLS.has(url)) return total;
      throw new Error(`Precached asset does not exist: ${path}`);
    }
    return total + statSync(path).size;
  }, 0);
  const manifestUrl = precacheUrls.find((url) => /^coloring\/manifest-.+\.json$/.test(url));
  const coloringManifest = manifestUrl
    ? JSON.parse(readFileSync(join(clientDir, manifestUrl), 'utf8'))
    : undefined;
  const problems = pwaPrecacheProblems({
    precacheUrls,
    appShellFallbackLookups: appShellFallbackLookupsFromSource(serviceWorkerSource),
    precacheBytes,
    responsiveAssetUrls,
    coloringManifest,
  });
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[pwa-precache] ${precacheUrls.length} entries / ${precacheBytes} bytes; ${responsiveAssetUrls.length} responsive derivatives use canonical offline fallbacks`
  );
}

if (isMain(import.meta.url)) runMain(checkPwaPrecache);
