import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../../web/src/lib/components/androidBeta/androidBeta.ts';
import { STARTER_COLORING_BOOK_ID } from '../../web/src/lib/state/books.ts';

// Proves the native static export really dropped the routes
// web/nativeExcludedRoutes.ts blanks out. A route's `prerender` flag only drops
// its HTML; without the build-time exclusion its JS chunk still ships, so
// /android-beta puts Google Play URLs inside the .ipa (App Review 2.3.10) and
// /admin puts a token-minting console inside a children's app (App Review
// 2.3.1, Play Deceptive Behavior).
//
// Every sentinel below is **derived from the module that owns it** rather than
// re-declared here, so renaming a URL or rewording the console can't leave this
// scanning for a string nothing produces any more — a guard that silently stops
// matching is worse than no guard, because the build stays green.
const BUILD_DIR = join(ROOT, 'web', 'build'); // capacitor.config.json webDir
const ADMIN_CONSOLE_PATH = 'web/src/lib/components/admin/AdminConsole.svelte';
export const REQUIRED_NATIVE_PAGES = ['privacy.html', 'changelog.html'];

// These literals survive minification and uniquely identify the web-only boot
// behavior that initWebOnlyServices() must keep out of the native JavaScript.
// web/src/lib/boot/webOnlyServices.ts documents the same boundary at the import
// site; sourceNeedle makes a renamed runtime literal fail loudly instead of
// leaving this scan to pass vacuously.
export const WEB_ONLY_MODULE_MARKERS = [
  {
    feature: 'install prompt',
    marker: 'beforeinstallprompt',
    sourcePath: 'web/src/lib/state/install.svelte.ts',
    sourceNeedle:
      "if (browser && !__IS_CAPACITOR__) {\n  window.addEventListener('beforeinstallprompt'",
  },
  {
    feature: 'install completion',
    marker: 'appinstalled',
    sourcePath: 'web/src/lib/state/install.svelte.ts',
    sourceNeedle: "addEventListener('appinstalled'",
  },
  {
    feature: 'PWA update lifecycle',
    marker: 'controllerchange',
    sourcePath: 'web/src/lib/pwa/updates.ts',
    sourceNeedle: "addEventListener('controllerchange'",
  },
  {
    feature: 'service-worker registration',
    marker: '/sw.js',
    sourcePath: 'web/src/lib/pwa/updates.ts',
    sourceNeedle: ".register('/sw.js')",
  },
];

// Scanning by **host** rather than whole URL is deliberate. The route's
// constants are template literals that interpolate PLAY_STORE_APP_ID, and the
// bundler keeps them that way — the built chunk carries
// `play.google.com/apps/testing/${A}`, so a whole-URL match sails straight past
// the very regression this exists to catch. The host is also the unit the
// guideline is about: no Play reference belongs in an iOS build at all.
export const FORBIDDEN_NATIVE_HOSTS = [
  ...new Set(
    [BETA_OPT_IN_URL, PLAY_STORE_LISTING_URL, TESTERS_GROUP_URL].map((u) => new URL(u).host)
  ),
];

/**
 * The admin console's own input placeholders, read from its source. These are
 * literal strings in the component's markup with no runtime interpolation, so
 * they survive minification verbatim and appear in the bundle only if the
 * console itself does.
 */
export function adminConsoleSentinels(
  source = readFileSync(join(ROOT, ADMIN_CONSOLE_PATH), 'utf8')
) {
  const sentinels = [...source.matchAll(/placeholder="([^"{}]+)"/g)].map((match) => match[1]);
  if (!sentinels.length) {
    throw new Error(
      `No admin-console sentinels found in ${ADMIN_CONSOLE_PATH}. The scan below would pass ` +
        `vacuously — pick new sentinels from the component's shipped copy instead of deleting this.`
    );
  }
  return [...new Set(sentinels)];
}

function bundleFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return bundleFiles(path);
    return /\.(js|html|json|webmanifest)$/.test(entry.name) ? [path] : [];
  });
}

export function webOnlyMarkerSourceProblems(
  readSource = (path) => readFileSync(join(ROOT, path), 'utf8')
) {
  return WEB_ONLY_MODULE_MARKERS.flatMap(({ feature, sourcePath, sourceNeedle }) =>
    readSource(sourcePath).includes(sourceNeedle)
      ? []
      : [
          `${sourcePath} no longer contains the ${feature} marker source ${JSON.stringify(sourceNeedle)}; ` +
            'update WEB_ONLY_MODULE_MARKERS before the native scan can run.',
        ]
  );
}

export function nativeBundleProblems(
  dir,
  sentinels = adminConsoleSentinels(),
  // This override exists only so the bundle-guard test can exercise a non-production starter id.
  starterBookId = STARTER_COLORING_BOOK_ID
) {
  if (!existsSync(dir)) return [`Native build output does not exist: ${dir}`];
  const forbidden = [
    ...FORBIDDEN_NATIVE_HOSTS.map((value) => ({ value, what: 'web-only host' })),
    ...sentinels.map((value) => ({ value, what: 'admin console' })),
    ...WEB_ONLY_MODULE_MARKERS.map(({ feature, marker }) => ({
      value: marker,
      what: `web-only ${feature}`,
    })),
  ];
  const problems = [];
  const coloringDirectory = join(dir, 'coloring');
  if (existsSync(coloringDirectory)) {
    const extraBookDirectories = readdirSync(coloringDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== starterBookId)
      .map((entry) => entry.name);
    if (extraBookDirectories.length) {
      problems.push(
        `Downloadable coloring books remain in the native bundle: ${extraBookDirectories.join(', ')}`
      );
    }
  }
  for (const path of bundleFiles(dir)) {
    const source = readFileSync(path, 'utf8');
    for (const { value, what } of forbidden) {
      if (source.includes(value)) {
        problems.push(`${what} "${value}" remains in ${relative(ROOT, path)}`);
      }
    }
  }
  return problems;
}

export function requiredNativePageProblems(dir) {
  return REQUIRED_NATIVE_PAGES.flatMap((page) =>
    existsSync(join(dir, page)) ? [] : [`Required native page is missing: ${page}`]
  );
}

export async function checkStaticBundle({ dir = BUILD_DIR, log = console.log } = {}) {
  const sentinels = adminConsoleSentinels();
  const problems = [
    ...webOnlyMarkerSourceProblems(),
    ...nativeBundleProblems(dir, sentinels),
    ...requiredNativePageProblems(dir),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[check-static-bundle] native export references none of: ${FORBIDDEN_NATIVE_HOSTS.join(', ')}; ` +
      `no admin-console copy (${sentinels.length} sentinel(s)); ` +
      `no web-only boot code (${WEB_ONLY_MODULE_MARKERS.length} marker(s)); ` +
      `required pages ${REQUIRED_NATIVE_PAGES.join(', ')} are present; ` +
      `only ${STARTER_COLORING_BOOK_ID} is bundled`
  );
}

if (isMain(import.meta.url)) runMain(checkStaticBundle);
