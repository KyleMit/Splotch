// Production web export of the React Native app (experiments/native-architecture),
// made installable and offline-capable the way the shipping PWA is (ADR-0022): the
// shipping manifest, icons and install head tags, plus a Workbox service worker
// whose first precache entry is this build's own app shell.
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSW } from 'workbox-build';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
  isAppShellNavigation,
  prependAppShellEntry,
} from '../../web/src/lib/pwa/appShellRoute.ts';
import { CACHE_BUST_VERSION_PARAM } from '../../web/src/lib/pwa/versionEndpoint.ts';
import { SERVICE_WORKER_PATH } from '../../experiments/native-architecture/src/platform/serviceWorkerPath.ts';
import { ROOT, isMain, run, runMain } from '../lib/proc.mjs';

export const NATIVE_APP_DIR = join(ROOT, 'experiments/native-architecture');
export const NATIVE_WEB_EXPORT_DIR = join(NATIVE_APP_DIR, 'dist/web');
export const NATIVE_WEB_SERVICE_WORKER = SERVICE_WORKER_PATH.slice(1);
const WEB_STATIC_DIR = join(ROOT, 'web/static');
const SHIPPING_APP_HTML = join(ROOT, 'web/src/app.html');
const SHIPPING_MANIFEST = 'site.webmanifest';
const ASSETS_PLACEHOLDER = '%sveltekit.assets%';
// Expo's build-identity file is read by its own tooling, never by the app.
const EXPORT_METADATA_FILE = 'metadata.json';

// The bundled starter coloring book makes the entry bundle the largest file, well
// above Workbox's 2 MiB default, and it must be precached for offline launch.
// tools/migration/check-native-web-precache.mjs owns the total budget.
const MAX_PRECACHED_FILE_BYTES = 8 * 1024 * 1024;
// A stalled navigation answers from the service worker after this long instead of
// leaving a child waiting for a load that may not finish (the shipping value).
const NAVIGATION_NETWORK_TIMEOUT_SECONDS = 5;

// The install-related head tags, copied from the shipping document so the two
// targets announce one app: Apple's standalone/title metas, the theme color, the
// icons and the manifest link.
const INSTALL_HEAD_TAG =
  /^\s*(<meta name="(?:apple-mobile-web-app-[a-z-]+|mobile-web-app-capable|theme-color)"[^>]*>|<link rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"[^>]*>)\s*$/gm;

export function shippingInstallHeadTags(appHtml) {
  const tags = [...appHtml.matchAll(INSTALL_HEAD_TAG)].map((match) =>
    match[1].replaceAll(ASSETS_PLACEHOLDER, '')
  );
  if (!tags.some((tag) => tag.includes('rel="manifest"')))
    throw new Error('The shipping app.html no longer links a web app manifest.');
  return tags;
}

export function installHeadTagAssets(tags) {
  return tags.map((tag) => /href="\/([^"]+)"/.exec(tag)?.[1]).filter((path) => path !== undefined);
}

export function manifestIconAssets(manifest) {
  return manifest.icons.map((icon) => icon.src.replace(/^\//, ''));
}

export function withInstallHeadTags(indexHtml, tags) {
  if (!indexHtml.includes('</head>')) throw new Error('The export has no </head> to extend.');
  return indexHtml.replace('</head>', `${tags.join('\n')}\n</head>`);
}

function exportWebBundle(outputDir) {
  run(
    join(ROOT, 'node_modules/.bin/expo'),
    ['export', '--platform', 'web', '--output-dir', outputDir],
    { cwd: NATIVE_APP_DIR }
  );
}

function copyShippingInstallAssets(outputDir) {
  const appHtml = readFileSync(SHIPPING_APP_HTML, 'utf8');
  const tags = shippingInstallHeadTags(appHtml);
  const manifest = JSON.parse(readFileSync(join(WEB_STATIC_DIR, SHIPPING_MANIFEST), 'utf8'));
  const assets = new Set([
    ...installHeadTagAssets(tags),
    ...manifestIconAssets(manifest),
    SHIPPING_MANIFEST,
  ]);
  for (const asset of assets) copyFileSync(join(WEB_STATIC_DIR, asset), join(outputDir, asset));
  const indexPath = join(outputDir, 'index.html');
  writeFileSync(indexPath, withInstallHeadTags(readFileSync(indexPath, 'utf8'), tags));
}

export function nativeWebServiceWorkerConfig(outputDir, shellUrl) {
  return {
    globDirectory: outputDir,
    globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,ttf,woff2,webmanifest}'],
    globIgnores: [NATIVE_WEB_SERVICE_WORKER, EXPORT_METADATA_FILE],
    swDest: join(outputDir, NATIVE_WEB_SERVICE_WORKER),
    inlineWorkboxRuntime: true,
    sourcemap: false,
    maximumFileSizeToCacheInBytes: MAX_PRECACHED_FILE_BYTES,
    manifestTransforms: [prependAppShellEntry(shellUrl)],
    // A new worker waits instead of taking over an open drawing; it activates
    // once every window of the old one has closed.
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: isAppShellNavigation,
        handler: 'NetworkFirst',
        options: {
          networkTimeoutSeconds: NAVIGATION_NETWORK_TIMEOUT_SECONDS,
          plugins: [createAppShellFallbackPlugin(shellUrl, CACHE_BUST_VERSION_PARAM)],
        },
      },
    ],
  };
}

export async function buildNativeWeb({ outputDir = NATIVE_WEB_EXPORT_DIR } = {}) {
  rmSync(outputDir, { recursive: true, force: true });
  exportWebBundle(outputDir);
  if (!existsSync(join(outputDir, 'index.html')))
    throw new Error(`Expo exported no index.html into ${outputDir}`);
  copyShippingInstallAssets(outputDir);
  const shellUrl = appShellPrecacheUrl(randomUUID());
  const { count, size, warnings } = await generateSW(
    nativeWebServiceWorkerConfig(outputDir, shellUrl)
  );
  if (warnings.length) throw new Error(warnings.join('\n'));
  console.log(`[native-web] ${outputDir}: ${count} precached files / ${size} bytes`);
}

if (isMain(import.meta.url)) runMain(buildNativeWeb);
