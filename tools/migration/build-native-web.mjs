// Production web export of the React Native app (experiments/native-architecture),
// made installable and offline-capable the way the shipping PWA is (ADR-0022): the
// shipping manifest, icons and install head tags, plus a Workbox service worker
// whose first precache entry is this build's own document, and whose every entry is
// pinned to the bytes this build wrote.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSW } from 'workbox-build';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
  isAppShellNavigation,
} from '../../web/src/lib/pwa/appShellRoute.ts';
import { CACHE_BUST_VERSION_PARAM } from '../../web/src/lib/pwa/versionEndpoint.ts';
import { SERVICE_WORKER_PATH } from '../../experiments/native-architecture/src/platform/serviceWorkerPath.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { SOUND_SETTINGS_KEY } from '../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { DRAWING_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';
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
export const APP_SHELL_FILE = 'index.html';

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

const VIEWPORT_META = /<meta name="viewport" content="[^"]*"\s*\/?>/;

// Shipping's viewport lets the page run under the status bar, notch and home indicator
// (viewport-fit=cover, ADR-0026), so the safe-area insets reach NativeFrame and the Notch Band
// on the web as they do in the native apps.
export function withShippingViewport(indexHtml, appHtml) {
  const viewport = VIEWPORT_META.exec(appHtml)?.[0];
  if (!viewport) throw new Error('The shipping app.html no longer declares a viewport.');
  if (!VIEWPORT_META.test(indexHtml)) throw new Error('The export has no viewport to replace.');
  return indexHtml.replace(VIEWPORT_META, viewport);
}

export function withInstallHeadTags(indexHtml, tags) {
  if (!indexHtml.includes('</head>')) throw new Error('The export has no </head> to extend.');
  return indexHtml.replace('</head>', `${tags.join('\n')}\n</head>`);
}

// Shipping paints its prerendered page in the visitor's theme before any script loads (app.html's
// boot script). The export's document is empty until the bundle mounts, so it paints the paper
// instead: in the system theme, or in the Light or Dark choice saved in the drawing settings,
// which the script stamps for the drawing screen's first frame to read (bootAppearance.web.ts).
export function bootThemeHeadTags({
  settingsKey = SOUND_SETTINGS_KEY,
  themes = DRAWING_THEMES,
} = {}) {
  const stamped = (theme) => `[${BOOT_THEME_ATTRIBUTE}=${theme}]`;
  const style = [
    `html{background:${themes.light.paper}}`,
    `@media (prefers-color-scheme:dark){html:not(${stamped('light')}){background:${themes.dark.paper}}}`,
    `html${stamped('dark')}{background:${themes.dark.paper}}`,
  ].join('');
  const script = [
    '(function(){try{',
    `var s=JSON.parse(localStorage.getItem(${JSON.stringify(settingsKey)}));`,
    'var a=s&&s.appearance;',
    `if(a==='light'||a==='dark')document.documentElement.setAttribute(${JSON.stringify(BOOT_THEME_ATTRIBUTE)},a)`,
    '}catch(e){}})();',
  ].join('');
  return [`<style>${style}</style>`, `<script>${script}</script>`];
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
  const indexPath = join(outputDir, APP_SHELL_FILE);
  writeFileSync(
    indexPath,
    withShippingViewport(
      withInstallHeadTags(readFileSync(indexPath, 'utf8'), [...tags, ...bootThemeHeadTags()]),
      appHtml
    )
  );
}

export function subresourceIntegrity(bytes) {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}

// Expo writes the document before the worker is generated, so unlike the shipping
// shell (prerendered afterwards) its bytes are known here. The shell is precached
// under a URL derived from those bytes and carries their integrity, so an install
// that receives any other document — a deploy landing between serving sw.js and
// fetching the shell — fails instead of pairing that document with this build's
// chunks.
export function contentAddressedShell(indexHtml) {
  return {
    url: appShellPrecacheUrl(createHash('sha256').update(indexHtml).digest('hex')),
    integrity: subresourceIntegrity(indexHtml),
  };
}

// Workbox reuses an entry already cached under the same URL and revision instead of
// fetching it, and otherwise trusts whatever the host answers. Every entry carries
// the integrity of the bytes this build wrote, so the browser rejects a fetched
// response from any other deploy and the install is abandoned.
export function pinPrecacheToExport(outputDir, shell) {
  return (manifest) => ({
    manifest: [
      { url: shell.url, revision: null, integrity: shell.integrity, size: 0 },
      ...manifest.map((entry) => ({
        ...entry,
        integrity: subresourceIntegrity(readFileSync(join(outputDir, entry.url))),
      })),
    ],
  });
}

export function nativeWebServiceWorkerConfig(outputDir, shell) {
  return {
    globDirectory: outputDir,
    globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,ttf,woff2,webmanifest}'],
    globIgnores: [NATIVE_WEB_SERVICE_WORKER, EXPORT_METADATA_FILE],
    swDest: join(outputDir, NATIVE_WEB_SERVICE_WORKER),
    inlineWorkboxRuntime: true,
    sourcemap: false,
    manifestTransforms: [pinPrecacheToExport(outputDir, shell)],
    // A new worker waits instead of taking over an open drawing; it activates
    // once every window of the old one has closed.
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: isAppShellNavigation,
        handler: 'NetworkFirst',
        options: {
          networkTimeoutSeconds: NAVIGATION_NETWORK_TIMEOUT_SECONDS,
          plugins: [createAppShellFallbackPlugin(shell.url, CACHE_BUST_VERSION_PARAM)],
        },
      },
    ],
  };
}

export async function buildNativeWeb({ outputDir = NATIVE_WEB_EXPORT_DIR } = {}) {
  rmSync(outputDir, { recursive: true, force: true });
  exportWebBundle(outputDir);
  if (!existsSync(join(outputDir, APP_SHELL_FILE)))
    throw new Error(`Expo exported no ${APP_SHELL_FILE} into ${outputDir}`);
  copyShippingInstallAssets(outputDir);
  const shell = contentAddressedShell(readFileSync(join(outputDir, APP_SHELL_FILE)));
  const { count, size, warnings } = await generateSW(
    nativeWebServiceWorkerConfig(outputDir, shell)
  );
  if (warnings.length) throw new Error(warnings.join('\n'));
  console.log(`[native-web] ${outputDir}: ${count} precached files / ${size} bytes`);
}

if (isMain(import.meta.url)) runMain(buildNativeWeb);
