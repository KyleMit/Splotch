// Assembles the one directory a web cutover deploy would publish (issue 3007's cutover-time hosting,
// ledger row X64): the SvelteKit build, which keeps every page and the /api/* routes it owns, with
// the React Native web export laid over it at the drawing route. The SvelteKit function's catch-all
// prefers a static file (adapter-netlify's `preferStatic`), so the export's index.html answers `/`
// and the function still answers every path no static file matches.
//
// One URL can serve only one file. The export's document, its service worker and the version that
// worker's update check reads replace SvelteKit's; any other file both builds write must be
// byte-identical, or the composition fails. Every entry of the export's worker must then resolve in
// the composed directory to the bytes its integrity pins, or every install from this deploy would
// be abandoned.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import {
  APP_SHELL_FILE,
  NATIVE_APP_DIR,
  NATIVE_WEB_EXPORT_DIR,
  NATIVE_WEB_SERVICE_WORKER,
  subresourceIntegrity,
} from './build-native-web.mjs';
import { precacheEntriesFromSource } from './check-native-web-precache.mjs';
import { APP_SHELL_PRECACHE_URL_PATTERN } from '../lib/pwa-precache-source.mjs';
import { filesRecursively } from '../lib/filesystem.mjs';
import { VERSION_JSON_FILENAME } from '../../web/src/lib/pwa/versionEndpoint.ts';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const SVELTEKIT_BUILD_DIR = join(ROOT, 'web/build');
const CUTOVER_WEB_DIR = join(NATIVE_APP_DIR, 'dist/cutover-web');

// The export's files that take the SvelteKit build's place: the drawing document, the one worker
// both apps register at scope `/`, and the version an installed page compares before applying it.
const NATIVE_REPLACED_FILES = [APP_SHELL_FILE, NATIVE_WEB_SERVICE_WORKER, VERSION_JSON_FILENAME];

const relativeFiles = (directory) =>
  filesRecursively(directory).map((path) => relative(directory, path).split(sep).join('/'));

const onDisk = (directory, url) =>
  join(directory, APP_SHELL_PRECACHE_URL_PATTERN.test(url) ? APP_SHELL_FILE : url);

// What the cutover deploy takes from the export: the replaced files and everything its worker
// precaches. check-native-web-precache.mjs already holds the export to precaching every file the app
// loads, so the rest (Expo's build identity, the template-free 404 shell no request reaches while
// the function answers unknown paths) stays out.
function nativeCutoverFiles(nativeDir) {
  const worker = readFileSync(join(nativeDir, NATIVE_WEB_SERVICE_WORKER), 'utf8');
  const entries = precacheEntriesFromSource(worker);
  if (!entries.length)
    throw new Error(`The export's ${NATIVE_WEB_SERVICE_WORKER} precaches nothing.`);
  const precached = entries
    .map(({ url }) => url)
    .filter((url) => !APP_SHELL_PRECACHE_URL_PATTERN.test(url));
  return { entries, files: [...new Set([...NATIVE_REPLACED_FILES, ...precached])] };
}

function cutoverCollisions({ sveltekitDir, nativeDir, files }) {
  return files.filter((file) => {
    if (NATIVE_REPLACED_FILES.includes(file)) return false;
    const existing = join(sveltekitDir, file);
    return (
      existsSync(existing) && !readFileSync(existing).equals(readFileSync(join(nativeDir, file)))
    );
  });
}

function unresolvedPrecacheEntries(composedDir, entries) {
  return entries.filter(({ url, integrity }) => {
    const path = onDisk(composedDir, url);
    return !existsSync(path) || subresourceIntegrity(readFileSync(path)) !== integrity;
  });
}

export function composeCutoverWeb({
  sveltekitDir = SVELTEKIT_BUILD_DIR,
  nativeDir = NATIVE_WEB_EXPORT_DIR,
  outputDir = CUTOVER_WEB_DIR,
  log = console.log,
} = {}) {
  for (const [name, directory] of [
    ['SvelteKit build', sveltekitDir],
    ['React Native web export', nativeDir],
  ])
    if (!existsSync(join(directory, APP_SHELL_FILE)))
      throw new Error(`The ${name} has no ${APP_SHELL_FILE}: ${directory}`);
  const { entries, files } = nativeCutoverFiles(nativeDir);
  const missing = files.filter((file) => !existsSync(join(nativeDir, file)));
  if (missing.length)
    throw new Error(`The export's worker precaches files it did not write: ${missing.join(', ')}`);
  const collisions = cutoverCollisions({ sveltekitDir, nativeDir, files });
  if (collisions.length)
    throw new Error(
      `Both builds write different bytes at ${collisions.join(', ')}; one URL can serve only one of them.`
    );
  const replaced = NATIVE_REPLACED_FILES.filter((file) => existsSync(join(sveltekitDir, file)));
  rmSync(outputDir, { recursive: true, force: true });
  cpSync(sveltekitDir, outputDir, { recursive: true });
  for (const file of files) {
    mkdirSync(dirname(join(outputDir, file)), { recursive: true });
    cpSync(join(nativeDir, file), join(outputDir, file));
  }
  const unresolved = unresolvedPrecacheEntries(outputDir, entries);
  if (unresolved.length)
    throw new Error(
      `The composed deploy does not serve the bytes the export's worker pins for ${unresolved.map(({ url }) => url).join(', ')}`
    );
  const left = relativeFiles(nativeDir).filter((file) => !files.includes(file));
  log(
    `[cutover-web] ${outputDir}: SvelteKit build plus ${files.length} export files (${replaced.join(', ')} replaced; ${entries.length} precache entries resolve to their pinned bytes; left out: ${left.join(', ') || 'nothing'})`
  );
}

if (isMain(import.meta.url)) runMain(async () => composeCutoverWeb());
