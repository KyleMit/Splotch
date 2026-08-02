import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../web/src/lib/components/androidBeta/androidBeta.ts';

// Proves the native static export really dropped the routes
// web/nativeExcludedRoutes.ts blanks out. A route's own `prerender` flag only
// drops its HTML; without the build-time exclusion its JS chunk still ships, so
// Google Play URLs end up inside the .ipa — an App Review 2.3.10 rejection, and
// exactly the kind of thing Apple's string scans surface.
//
// Scanning by **host** rather than by whole URL is deliberate. The route's
// constants are template literals that interpolate PLAY_STORE_APP_ID, and the
// bundler keeps them that way — the built chunk carries
// `play.google.com/apps/testing/${A}`, so a whole-URL match sails straight past
// the very regression this exists to catch. The host is also the unit the
// guideline is about: no Play reference belongs in an iOS build at all.
//
// Hosts are derived from the constants that own the URLs rather than
// re-declared, so moving a link can't leave this scanning for a host nothing
// produces any more.
const BUILD_DIR = join(ROOT, 'web', 'build'); // capacitor.config.json webDir

export const FORBIDDEN_NATIVE_HOSTS = [
  ...new Set(
    [BETA_OPT_IN_URL, PLAY_STORE_LISTING_URL, TESTERS_GROUP_URL].map((u) => new URL(u).host)
  ),
];

function bundleFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return bundleFiles(path);
    return /\.(js|html|json|webmanifest)$/.test(entry.name) ? [path] : [];
  });
}

export function nativeBundleProblems(dir) {
  if (!existsSync(dir)) return [`Native build output does not exist: ${dir}`];
  const problems = [];
  for (const path of bundleFiles(dir)) {
    const source = readFileSync(path, 'utf8');
    for (const host of FORBIDDEN_NATIVE_HOSTS) {
      if (source.includes(host)) problems.push(`${host} remains in ${relative(ROOT, path)}`);
    }
  }
  return problems;
}

export async function checkNativeBundle({ dir = BUILD_DIR, log = console.log } = {}) {
  const problems = nativeBundleProblems(dir);
  if (problems.length) throw new Error(problems.join('\n'));
  log(`[native-bundle] native export references none of: ${FORBIDDEN_NATIVE_HOSTS.join(', ')}`);
}

if (isMain(import.meta.url)) runMain(checkNativeBundle);
