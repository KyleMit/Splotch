import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_DIR = join(ROOT, 'web/.svelte-kit/output/client');
const SW_PATH = join(CLIENT_DIR, 'sw.js');
const STATIC_COLORING_DIR = join(ROOT, 'web/static/coloring');
const RESPONSIVE_TIER_PATTERN = /^max-\d+px$/;
const RUNTIME_GENERATED_PRECACHE_URLS = new Set(['_app/env.js']);
// Leaves room for ordinary app growth while rejecting another duplicated coloring tier.
export const MAX_PWA_PRECACHE_BYTES = 38_000_000;

export function precacheUrlsFromSource(source) {
  return [...source.matchAll(/\{url:("(?:\\.|[^"\\])*"),revision:/g)].map((match) =>
    JSON.parse(match[1])
  );
}

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

export function pwaPrecacheProblems({
  precacheUrls,
  precacheBytes,
  responsiveAssetUrls,
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

  const precached = new Set(precacheUrls);
  const missingCanonicalUrls = responsiveAssetUrls
    .map((url) => url.replace(/^coloring\/max-\d+px\//, 'coloring/'))
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
  const problems = pwaPrecacheProblems({
    precacheUrls,
    precacheBytes,
    responsiveAssetUrls,
  });
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[pwa-precache] ${precacheUrls.length} entries / ${precacheBytes} bytes; ${responsiveAssetUrls.length} responsive derivatives use canonical offline fallbacks`
  );
}

if (isMain(import.meta.url)) runMain(checkPwaPrecache);
