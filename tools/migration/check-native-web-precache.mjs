// Verifies the React Native web export's service worker the way
// tools/check-pwa-precache.mjs verifies the shipping one: this build's app shell is
// the first entry and the offline answer, every file the export serves is precached
// and exists, the bundled starter coloring book is in a precached chunk, and the
// precache stays inside its budget.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  APP_SHELL_FALLBACK_CALLBACKS,
  appShellFallbackLookupsFromSource,
} from '../check-pwa-precache.mjs';
import {
  APP_SHELL_PRECACHE_URL_PATTERN,
  precacheUrlsFromSource,
} from '../lib/pwa-precache-source.mjs';
import { filesRecursively } from '../lib/filesystem.mjs';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import {
  NATIVE_APP_DIR,
  NATIVE_WEB_EXPORT_DIR,
  NATIVE_WEB_SERVICE_WORKER,
} from './build-native-web.mjs';
import { isMain, runMain } from '../lib/proc.mjs';

// The export is about 4.2 MB with the Farm book bundled; this leaves room for app
// growth while rejecting a second bundled book or an accidental duplicate bundle.
export const MAX_NATIVE_WEB_PRECACHE_BYTES = 6_000_000;
// Served by the export but never fetched by the page: the worker itself, and Expo's
// build-identity file.
const UNFETCHED_EXPORT_FILES = new Set([NATIVE_WEB_SERVICE_WORKER, 'metadata.json']);
// index.html is precached as the app shell under its build-unique URL instead.
const APP_SHELL_FILE = 'index.html';
const BUNDLED_ART_FILL = /fill: '(data:image\/webp;base64,[A-Za-z0-9+/=]+)'/g;

export function starterBookFills(appDir = NATIVE_APP_DIR) {
  return FARM_PAGE_IDS.flatMap((pageId) => {
    const source = readFileSync(
      join(appDir, 'src/drawing/bundledFarm', `${pageId.split('/')[1]}.ts`),
      'utf8'
    );
    const fills = [...source.matchAll(BUNDLED_ART_FILL)].map((match) => match[1]);
    if (!fills.length) throw new Error(`No bundled fill found for ${pageId}`);
    return fills.map((fill) => ({ pageId, fill }));
  });
}

export function nativeWebPrecacheProblems({
  precacheUrls,
  appShellFallbackLookups,
  exportedFiles,
  precachedScripts,
  starterFills,
  precacheBytes,
  maxPrecacheBytes = MAX_NATIVE_WEB_PRECACHE_BYTES,
}) {
  const problems = [];
  const shellUrls = precacheUrls.filter((url) => APP_SHELL_PRECACHE_URL_PATTERN.test(url));
  if (shellUrls.length !== 1) {
    problems.push(
      `Expected one build-matched app shell in the precache, found ${shellUrls.length}`
    );
  } else {
    if (precacheUrls[0] !== shellUrls[0])
      problems.push('The app shell must be the first precache entry');
    for (const callback of APP_SHELL_FALLBACK_CALLBACKS) {
      const lookups = appShellFallbackLookups.filter((lookup) => lookup.callback === callback);
      if (lookups.length !== 1 || lookups[0].url !== shellUrls[0])
        problems.push(`The navigation fallback's ${callback} does not look up ${shellUrls[0]}`);
    }
  }
  const precached = new Set(precacheUrls);
  const exported = new Set(exportedFiles);
  const missingOnDisk = [...precached].filter(
    (url) => !APP_SHELL_PRECACHE_URL_PATTERN.test(url) && !exported.has(url)
  );
  if (missingOnDisk.length)
    problems.push(`Precached files missing from the export: ${missingOnDisk.join(', ')}`);
  const notPrecached = exportedFiles.filter(
    (file) => !UNFETCHED_EXPORT_FILES.has(file) && file !== APP_SHELL_FILE && !precached.has(file)
  );
  if (notPrecached.length)
    problems.push(`Exported files missing from the precache: ${notPrecached.join(', ')}`);
  const missingPages = [
    ...new Set(
      starterFills
        .filter(({ fill }) => !precachedScripts.some((script) => script.includes(fill)))
        .map(({ pageId }) => pageId)
    ),
  ];
  if (missingPages.length)
    problems.push(
      `Starter coloring pages missing from precached chunks: ${missingPages.join(', ')}`
    );
  if (precacheBytes > maxPrecacheBytes)
    problems.push(`Precache is ${precacheBytes} bytes, above the ${maxPrecacheBytes}-byte budget`);
  return problems;
}

export function checkNativeWebPrecache({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  starterFills = starterBookFills(),
  maxPrecacheBytes,
  log = console.log,
} = {}) {
  const swPath = join(exportDir, NATIVE_WEB_SERVICE_WORKER);
  if (!existsSync(swPath)) throw new Error(`Service worker does not exist: ${swPath}`);
  const source = readFileSync(swPath, 'utf8');
  const precacheUrls = precacheUrlsFromSource(source);
  if (!precacheUrls.length) throw new Error(`No Workbox precache manifest found in ${swPath}`);
  const exportedFiles = filesRecursively(exportDir).map((path) =>
    relative(exportDir, path).split(sep).join('/')
  );
  const onDisk = (url) =>
    APP_SHELL_PRECACHE_URL_PATTERN.test(url)
      ? join(exportDir, APP_SHELL_FILE)
      : join(exportDir, url);
  const present = [...new Set(precacheUrls)].filter((url) => existsSync(onDisk(url)));
  const precacheBytes = present.reduce((total, url) => total + statSync(onDisk(url)).size, 0);
  const precachedScripts = present
    .filter((url) => url.endsWith('.js'))
    .map((url) => readFileSync(onDisk(url), 'utf8'));
  const problems = nativeWebPrecacheProblems({
    precacheUrls,
    appShellFallbackLookups: appShellFallbackLookupsFromSource(source),
    exportedFiles,
    precachedScripts,
    starterFills,
    precacheBytes,
    maxPrecacheBytes,
  });
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[native-web-precache] ${new Set(precacheUrls).size} entries / ${precacheBytes} bytes; app shell first; ${new Set(starterFills.map(({ pageId }) => pageId)).size} starter pages bundled`
  );
}

if (isMain(import.meta.url)) runMain(async () => checkNativeWebPrecache());
