// Verifies the React Native web export's service worker the way
// tools/check-pwa-precache.mjs verifies the shipping one: this build's app shell is
// the first entry and the offline answer, every entry is pinned to the bytes this
// build exported, every file the export serves (and every asset the shell names) is
// precached, every bundled starter coloring page's line art and images are precached
// while none of them rides in a script the shell loads, and the precache stays inside
// its budget.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  APP_SHELL_FALLBACK_CALLBACKS,
  appShellFallbackLookupsFromSource,
} from '../lib/pwa-precache-source.mjs';
import { APP_SHELL_PRECACHE_URL_PATTERN } from '../lib/pwa-precache-source.mjs';
import { filesRecursively } from '../lib/filesystem.mjs';
import { FARM_PAGE_IDS } from '../../src/drawing/bundledBooks.ts';
import { BUNDLED_FARM_DIR, bundledFarmImageFiles, imageFilePaths } from './gen-bundled-farm.mjs';
import { NATIVE_DEFERRED_ICONS } from '../../src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../src/rsdDrawing/splotchy.generated.ts';
import {
  APP_SHELL_FALLBACK_ROUTES,
  APP_SHELL_FILE,
  NATIVE_WEB_EXPORT_DIR,
  NOT_FOUND_FILE,
  NATIVE_WEB_SERVICE_WORKER,
  contentAddressedShell,
  documentCards as writtenDocumentCards,
  isHostedStaticFile,
  socialCardHeadTags,
  subresourceIntegrity,
  webVersionHeadTag,
} from './build-native-web.mjs';
import { isMain, runMain } from '../lib/proc.mjs';
import { VERSION_JSON_FILENAME } from '../../src/lib/pwa/versionEndpoint.ts';
import { startupScriptList } from './prerender-native-web.mjs';
import { documentPolicyProblems } from './lib/native-web-csp.mjs';
import { pageOnlyChunks, writtenPageDocuments } from './prerender-native-web-pages.mjs';

// The RN web export makes the same offline promise as the shipping PWA it is meant to
// replace, so it answers to the same budget.
export const MAX_NATIVE_WEB_PRECACHE_BYTES = 12_000_000;
// The version endpoint must reach the network; the worker, build identity and host's not-found
// answer are not page assets. A page document is answered by the network, and offline by the app
// shell, which shows the same page over the paper, or the not-found page for a document-only page
// such as /beta (build-native-web.mjs's navigation routes); an unlinked document by the network
// alone.
const UNFETCHED_EXPORT_FILES = new Set([
  NATIVE_WEB_SERVICE_WORKER,
  'metadata.json',
  NOT_FOUND_FILE,
  VERSION_JSON_FILENAME,
  ...writtenPageDocuments().map(({ file }) => file),
]);
const OUTLINE_PATH_DATA = /\bd: '([^']+)'/;
const JSON_STRING = '"(?:\\\\.|[^"\\\\])*"';
const PRECACHE_ENTRY = new RegExp(
  `\\{url:(${JSON_STRING}),revision:(${JSON_STRING}|null)(?:,integrity:(${JSON_STRING}))?\\}`,
  'g'
);
const SHELL_ASSET_REFERENCE = /(?:src|href)="\/([^"?#]+)"/g;
// An anchor names a page to navigate to, never a file the shell loads.
const ANCHOR_START_TAG = /<a\s[^>]*>/gi;
const PATH_DATA = / d="([^"]+)"/;
// Shorter path data (a lone circle or square) could recur in a startup icon by coincidence.
const MIN_LAZY_ICON_SAMPLE_CHARS = 40;
const RELEASE_NOTES_JSON = new URL(
  '../../src/information/releaseNotes.generated.json',
  import.meta.url
);
// Text a minifier copies into a string literal unescaped, long enough not to recur by chance.
const PLAIN_TEXT_RUN = /[A-Za-z0-9 ,.]{24,}/g;

// The first path of each lazily imported icon (iconRegistry.ts): the scripts the shell loads must
// hold none, or the deferred set has fallen back onto the startup path.
export function lazyIconSamples() {
  return [NATIVE_SPLOTCHY, ...Object.values(NATIVE_DEFERRED_ICONS).map((icon) => icon.light)]
    .map((markup) => PATH_DATA.exec(markup)?.[1])
    .filter((pathData) => pathData !== undefined && pathData.length >= MIN_LAZY_ICON_SAMPLE_CHARS);
}

// The first path of each bundled page's line art, which the web export loads per page
// (bundledOutlines.web.ts): it must be in a precached chunk and in no script the shell loads.
export function starterOutlineSamples(farmDir = BUNDLED_FARM_DIR) {
  return FARM_PAGE_IDS.map((pageId) => {
    const sample = OUTLINE_PATH_DATA.exec(
      readFileSync(join(farmDir, `${pageId.split('/')[1]}.ts`), 'utf8')
    )?.[1];
    if (!sample) throw new Error(`No bundled line art found for ${pageId}`);
    return { pageId, sample };
  });
}

// The longest plain-text run of each release note What's New shows. Only Settings imports the
// notes (settings/whatsNew.ts); the settings store reads the stamp alone (whatsNewStamp.ts).
export function releaseNoteSamples() {
  const releases = Object.values(JSON.parse(readFileSync(RELEASE_NOTES_JSON, 'utf8')));
  return releases
    .flat()
    .flatMap((section) => section.blocks)
    .map(({ text }) => text.match(PLAIN_TEXT_RUN)?.sort((a, b) => b.length - a.length)[0])
    .filter((sample) => sample !== undefined);
}

export function lazyModuleSamples() {
  return [
    ...lazyIconSamples().map((sample) => ({ module: 'deferred icons', sample })),
    ...starterOutlineSamples().map(({ pageId, sample }) => ({
      module: `${pageId} line art`,
      sample,
    })),
    ...releaseNoteSamples().map((sample) => ({ module: 'release notes', sample })),
  ];
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The directories netlify.toml caches immutable for a year, which only a name that changes with its
// bytes may be (ADR-0042). Expo names every file under them with the MD5 of its content.
export const IMMUTABLE_EXPORT_DIRECTORIES = ['_expo/static/', 'assets/'];
const CONTENT_HASHED_NAME = /[-.][0-9a-f]{32}\.[a-z0-9]+$/;

export function unhashedImmutableFiles(exportedFiles) {
  return exportedFiles.filter(
    (file) =>
      IMMUTABLE_EXPORT_DIRECTORIES.some((directory) => file.startsWith(directory)) &&
      !CONTENT_HASHED_NAME.test(file)
  );
}

// Every image the bundled starter book shows, by the hash of the shipping file the web export
// serves as a hashed asset.
export function starterBookImages() {
  const { pages, selectors, covers } = bundledFarmImageFiles();
  return [
    ...[pages, selectors].flatMap((images) =>
      Object.entries(images).flatMap(([pageId, page]) =>
        imageFilePaths(page).map((path) => ({ pageId, sha256: sha256(readFileSync(path)) }))
      )
    ),
    ...Object.values(covers).map((path) => ({
      pageId: 'farm cover',
      sha256: sha256(readFileSync(path)),
    })),
  ];
}

export function precacheEntriesFromSource(source) {
  return [...source.matchAll(PRECACHE_ENTRY)].map((match) => ({
    url: JSON.parse(match[1]),
    revision: JSON.parse(match[2]),
    integrity: match[3] === undefined ? null : JSON.parse(match[3]),
  }));
}

export function shellAssetReferences(indexHtml) {
  return [
    ...new Set([
      ...[...indexHtml.replace(ANCHOR_START_TAG, '').matchAll(SHELL_ASSET_REFERENCE)].map(
        (match) => match[1]
      ),
      ...startupScriptList(indexHtml).map((src) => src.replace(/^\//, '')),
    ]),
  ];
}

function shellProblems({ precacheUrls, expectedShellUrl, appShellFallbackLookups }) {
  const shellUrls = precacheUrls.filter((url) => APP_SHELL_PRECACHE_URL_PATTERN.test(url));
  if (shellUrls.length !== 1)
    return [`Expected one build-matched app shell in the precache, found ${shellUrls.length}`];
  const problems = [];
  if (precacheUrls[0] !== shellUrls[0])
    problems.push('The app shell must be the first precache entry');
  if (shellUrls[0] !== expectedShellUrl)
    problems.push(`The app shell ${shellUrls[0]} is not the content address ${expectedShellUrl}`);
  for (const callback of APP_SHELL_FALLBACK_CALLBACKS) {
    const lookups = appShellFallbackLookups.filter((lookup) => lookup.callback === callback);
    if (
      lookups.length !== APP_SHELL_FALLBACK_ROUTES[callback] ||
      lookups.some((lookup) => lookup.url !== shellUrls[0])
    )
      problems.push(`The navigation fallback's ${callback} does not look up ${shellUrls[0]}`);
  }
  return problems;
}

export function nativeWebPrecacheProblems({
  precacheEntries,
  appShellFallbackLookups,
  expectedShellUrl,
  integrityOnDisk,
  shellReferences,
  exportedFiles,
  precachedScripts,
  precachedHashes,
  shellScripts,
  starterOutlines,
  starterImages,
  lazySamples,
  precacheBytes,
  maxPrecacheBytes = MAX_NATIVE_WEB_PRECACHE_BYTES,
  pageOnlyFiles = [],
}) {
  const precacheUrls = precacheEntries.map((entry) => entry.url);
  const problems = shellProblems({ precacheUrls, expectedShellUrl, appShellFallbackLookups });
  const unpinned = precacheEntries.filter(
    (entry) => !entry.integrity || entry.integrity !== integrityOnDisk.get(entry.url)
  );
  if (unpinned.length)
    problems.push(
      `Precache entries not pinned to this export's bytes: ${unpinned.map((entry) => entry.url).join(', ')}`
    );
  const precached = new Set(precacheUrls);
  const exported = new Set(exportedFiles);
  const missingOnDisk = [...precached].filter(
    (url) => !APP_SHELL_PRECACHE_URL_PATTERN.test(url) && !exported.has(url)
  );
  if (missingOnDisk.length)
    problems.push(`Precached files missing from the export: ${missingOnDisk.join(', ')}`);
  const pageOnly = new Set(pageOnlyFiles);
  const unhashed = unhashedImmutableFiles(exportedFiles);
  if (unhashed.length)
    problems.push(
      `Files the host caches immutable carry no content hash in their name: ${unhashed.join(', ')}`
    );
  const hostedPrecached = precacheUrls.filter(isHostedStaticFile);
  if (hostedPrecached.length)
    problems.push(
      `Files the host serves beside the app are precached: ${hostedPrecached.join(', ')}`
    );
  const notPrecached = exportedFiles.filter(
    (file) =>
      !UNFETCHED_EXPORT_FILES.has(file) &&
      !isHostedStaticFile(file) &&
      !pageOnly.has(file) &&
      file !== APP_SHELL_FILE &&
      !precached.has(file)
  );
  const pageOnlyPrecached = pageOnlyFiles.filter((file) => precached.has(file));
  if (pageOnlyPrecached.length)
    problems.push(
      `Chunks only a page document loads are precached: ${pageOnlyPrecached.join(', ')}`
    );
  if (notPrecached.length)
    problems.push(`Exported files missing from the precache: ${notPrecached.join(', ')}`);
  const unbackedReferences = shellReferences.filter((path) => !precached.has(path));
  if (unbackedReferences.length)
    problems.push(
      `The app shell names files outside its precache: ${unbackedReferences.join(', ')}`
    );
  const missingPages = starterOutlines
    .filter(({ sample }) => !precachedScripts.some((script) => script.includes(sample)))
    .map(({ pageId }) => pageId);
  if (missingPages.length)
    problems.push(
      `Starter coloring pages missing from precached chunks: ${missingPages.join(', ')}`
    );
  const missingImages = [
    ...new Set(
      starterImages
        .filter((image) => !precachedHashes.has(image.sha256))
        .map(({ pageId }) => pageId)
    ),
  ];
  if (missingImages.length)
    problems.push(`Starter coloring images missing from the precache: ${missingImages.join(', ')}`);
  const startupModules = lazySamples.filter(({ sample }) =>
    shellScripts.some((script) => script.includes(sample))
  );
  if (startupModules.length)
    problems.push(
      `${startupModules.length} lazily loaded samples are in the app shell's scripts: ${[...new Set(startupModules.map(({ module }) => module))].join(', ')}`
    );
  if (precacheBytes > maxPrecacheBytes)
    problems.push(`Precache is ${precacheBytes} bytes, above the ${maxPrecacheBytes}-byte budget`);
  return problems;
}

// A pasted link and a search result read these from the document itself, before any script.
export function socialCardProblems(html, file, card) {
  const missing = socialCardHeadTags(card).filter((tag) => !html.includes(tag));
  return missing.length
    ? [`${file} lacks ${missing.length} of ${card.path}'s description and link-preview tags`]
    : [];
}

export function checkNativeWebPrecache({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  starterOutlines = starterOutlineSamples(),
  starterImages = starterBookImages(),
  lazySamples = lazyModuleSamples(),
  maxPrecacheBytes,
  documentCards = writtenDocumentCards(),
  log = console.log,
} = {}) {
  const swPath = join(exportDir, NATIVE_WEB_SERVICE_WORKER);
  if (!existsSync(swPath)) throw new Error(`Service worker does not exist: ${swPath}`);
  const source = readFileSync(swPath, 'utf8');
  const precacheEntries = precacheEntriesFromSource(source);
  if (!precacheEntries.length) throw new Error(`No Workbox precache manifest found in ${swPath}`);
  const exportedFiles = filesRecursively(exportDir).map((path) =>
    relative(exportDir, path).split(sep).join('/')
  );
  const onDisk = (url) =>
    APP_SHELL_PRECACHE_URL_PATTERN.test(url)
      ? join(exportDir, APP_SHELL_FILE)
      : join(exportDir, url);
  const present = [...new Set(precacheEntries.map((entry) => entry.url))].filter((url) =>
    existsSync(onDisk(url))
  );
  const precacheBytes = present.reduce((total, url) => total + statSync(onDisk(url)).size, 0);
  const indexHtml = readFileSync(join(exportDir, APP_SHELL_FILE));
  const version = JSON.parse(readFileSync(join(exportDir, VERSION_JSON_FILENAME), 'utf8'));
  if (
    typeof version?.version !== 'string' ||
    !version.version ||
    !indexHtml.toString('utf8').includes(webVersionHeadTag(version.version))
  )
    throw new Error('The app shell and version endpoint must carry the same web build version.');
  if (precacheEntries.some(({ url }) => url === VERSION_JSON_FILENAME))
    throw new Error('The version endpoint must stay out of the precache.');
  const shellReferences = shellAssetReferences(indexHtml.toString('utf8'));
  const problems = nativeWebPrecacheProblems({
    precacheEntries,
    appShellFallbackLookups: appShellFallbackLookupsFromSource(source),
    expectedShellUrl: contentAddressedShell(indexHtml).url,
    integrityOnDisk: new Map(
      present.map((url) => [url, subresourceIntegrity(readFileSync(onDisk(url)))])
    ),
    shellReferences,
    exportedFiles,
    precachedScripts: present
      .filter((url) => url.endsWith('.js'))
      .map((url) => readFileSync(onDisk(url), 'utf8')),
    precachedHashes: new Set(present.map((url) => sha256(readFileSync(onDisk(url))))),
    shellScripts: shellReferences
      .filter((path) => path.endsWith('.js') && existsSync(join(exportDir, path)))
      .map((path) => readFileSync(join(exportDir, path), 'utf8')),
    starterOutlines,
    starterImages,
    lazySamples,
    precacheBytes,
    maxPrecacheBytes,
    pageOnlyFiles: pageOnlyChunks(exportDir, APP_SHELL_FILE),
  });
  problems.push(
    ...documentPolicyProblems(indexHtml.toString('utf8'), APP_SHELL_FILE),
    ...[...new Set([NOT_FOUND_FILE, ...writtenPageDocuments().map(({ file }) => file)])].flatMap(
      (file) => documentPolicyProblems(readFileSync(join(exportDir, file), 'utf8'), file)
    ),
    ...documentCards.flatMap(({ file, card }) =>
      socialCardProblems(readFileSync(join(exportDir, file), 'utf8'), file, card)
    )
  );
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[native-web-precache] ${present.length} entries / ${precacheBytes} bytes; content-addressed app shell first; every entry integrity-pinned; ${starterOutlines.length} starter pages and ${starterImages.length} starter images precached off the startup path`
  );
}

if (isMain(import.meta.url)) runMain(async () => checkNativeWebPrecache());
