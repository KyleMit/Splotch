import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { filesRecursively } from './lib/filesystem.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_DIR = join(ROOT, 'web/.svelte-kit/output/client');
const SW_PATH = join(CLIENT_DIR, 'sw.js');
const STATIC_COLORING_DIR = join(ROOT, 'web/static/coloring');
const RESPONSIVE_TIER_PATTERN = /^max-\d+px$/;
const RESPONSIVE_TIER_URL_PATTERN = /^coloring\/max-\d+px\//;
// The canonical file a responsive derivative falls back to offline. A paper
// presentation raster falls back to the SVG it was rendered from; this mirrors
// the service worker's serveResponsiveColoringWithCanonicalFallback, whose
// serialized body cannot import a helper, so tools/tests/check-pwa-precache.test.mjs
// and web/src/lib/pwa/coloringFallback.test.ts each pin the presentation case.
function canonicalFallbackUrl(url) {
  return url
    .replace(RESPONSIVE_TIER_URL_PATTERN, 'coloring/')
    .replace(/\.presentation\.webp$/, '.overlay.svg');
}
const RUNTIME_GENERATED_PRECACHE_URLS = new Set(['_app/env.js']);
const SERVED_ONLY_ASSET_URLS = new Set(['large-image.png']);
// Leaves room for ordinary app growth while rejecting a second bundled coloring book.
export const MAX_PWA_PRECACHE_BYTES = 12_000_000;

export function precacheUrlsFromSource(source) {
  return [...source.matchAll(/\{url:("(?:\\.|[^"\\])*"),revision:/g)].map((match) =>
    JSON.parse(match[1])
  );
}

export function pwaPrecacheProblems({
  precacheUrls,
  precacheBytes,
  responsiveAssetUrls,
  coloringManifest,
  maxPrecacheBytes = MAX_PWA_PRECACHE_BYTES,
}) {
  const problems = [];
  if (!precacheUrls.includes('_app/env.js')) {
    problems.push('SvelteKit runtime environment module is missing from the PWA precache');
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
  // A web pack's presentation tiers are hosted responsive distribution, never
  // precached: offline, the starter paper falls back to its precached SVG.
  const missingStarterFiles = starterFiles
    .map((file) => file.path.slice(1))
    .filter((url) => !RESPONSIVE_TIER_URL_PATTERN.test(url))
    .filter((url) => !precached.has(url));
  if (missingStarterFiles.length) {
    problems.push(
      `${missingStarterFiles.length} starter coloring assets are missing from the PWA precache: ${missingStarterFiles[0]}`
    );
  }
  const missingCanonicalUrls = responsiveAssetUrls
    .map(canonicalFallbackUrl)
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
  staticColoringDir = STATIC_COLORING_DIR,
  log = console.log,
} = {}) {
  if (!existsSync(swPath)) throw new Error(`Service worker does not exist: ${swPath}`);
  const precacheUrls = precacheUrlsFromSource(readFileSync(swPath, 'utf8'));
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
    const path = join(clientDir, url);
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
