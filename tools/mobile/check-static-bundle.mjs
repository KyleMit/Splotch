import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../../web/src/lib/components/beta/androidBeta.ts';
import {
  TESTFLIGHT_APP_URL,
  TESTFLIGHT_INVITE_URL,
} from '../../web/src/lib/components/beta/iosBeta.ts';
import { STARTER_COLORING_BOOK_ID } from '../../web/src/lib/state/books.ts';
import { FEEDBACK_URL } from '../../web/src/lib/siteUrl.ts';
import { supportEmail } from '../../web/src/lib/supportEmail.ts';
import { storePage } from '../../web/src/routes/dev/store-frames/lib/pages.ts';

// Proves the native static export really dropped the routes
// web/nativeExcludedRoutes.ts blanks out. A route's `prerender` flag only drops
// its HTML; without the build-time exclusion its JS chunk still ships, so
// /beta puts Google Play URLs inside the .ipa (App Review 2.3.10) and enrollment
// links inside the app they enroll into, and /admin puts a token-minting console
// inside a children's app (App Review 2.3.1, Play Deceptive Behavior).
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
    [
      BETA_OPT_IN_URL,
      PLAY_STORE_LISTING_URL,
      TESTERS_GROUP_URL,
      TESTFLIGHT_APP_URL,
      TESTFLIGHT_INVITE_URL,
    ].map((u) => new URL(u).host)
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
    // Derived from the dev harness's own copy module, so rewording the store
    // pages moves the sentinel with them.
    { value: storePage('04-ai').title, what: 'dev store-frames copy' },
    { value: supportEmail(), what: 'web-only support email' },
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

/**
 * The other half of {@link requiredNativePageProblems}: a page that ships but
 * that nothing links to is unreachable in the app, and the store requirement is
 * that a parent can *get to* the privacy policy — not that a file exists.
 *
 * Matching on the `href="…"` prefix is what separates a real link from noise:
 * the route manifest (`entry/app.*.js`) names every route as a bare `"/privacy"`
 * whether or not anything links there, so a bare-path search would pass
 * vacuously forever. Only `.js` is scanned because both links live in the
 * client bundle's component chunks (Settings' About and What's New sections),
 * and a prerendered page contains its own path in ways that would self-match.
 *
 * This is a *presence* assertion, so it cannot rot quietly: if Svelte ever stops
 * emitting the attribute as a literal, the build fails rather than passing.
 */
export function requiredNativePageLinkProblems(dir) {
  if (!existsSync(dir)) return [];
  const scripts = bundleFiles(dir)
    .filter((path) => path.endsWith('.js'))
    .map((path) => readFileSync(path, 'utf8'));
  return REQUIRED_NATIVE_PAGES.flatMap((page) => {
    const href = `href="/${page.replace(/\.html$/, '')}"`;
    return scripts.some((source) => source.includes(href))
      ? []
      : [`Native bundle ships ${page} but nothing in it links to the page (${href})`];
  });
}

export function nativePrivacyFeedbackProblems(dir) {
  const privacyPath = join(dir, 'privacy.html');
  if (!existsSync(privacyPath)) return [];
  const source = readFileSync(privacyPath, 'utf8');
  return [
    ...(source.includes(`href="${FEEDBACK_URL}"`)
      ? []
      : [`Native privacy page does not link to the hosted feedback form: ${FEEDBACK_URL}`]),
    ...(source.includes('href="/feedback"')
      ? ['Native privacy page retains a relative /feedback link']
      : []),
  ];
}

export async function checkStaticBundle({ dir = BUILD_DIR, log = console.log } = {}) {
  const sentinels = adminConsoleSentinels();
  const problems = [
    ...webOnlyMarkerSourceProblems(),
    ...nativeBundleProblems(dir, sentinels),
    ...requiredNativePageProblems(dir),
    ...requiredNativePageLinkProblems(dir),
    ...nativePrivacyFeedbackProblems(dir),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[check-static-bundle] native export references none of: ${FORBIDDEN_NATIVE_HOSTS.join(', ')}; ` +
      `no admin-console copy (${sentinels.length} sentinel(s)); ` +
      `no dev store-frames copy; ` +
      `no web-only support email; ` +
      `no web-only boot code (${WEB_ONLY_MODULE_MARKERS.length} marker(s)); ` +
      `required pages ${REQUIRED_NATIVE_PAGES.join(', ')} are present and linked; ` +
      `privacy links to the hosted feedback form; ` +
      `only ${STARTER_COLORING_BOOK_ID} is bundled`
  );
}

if (isMain(import.meta.url)) runMain(checkStaticBundle);
