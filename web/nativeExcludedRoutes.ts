import type { Plugin } from 'vite';

// Routes that must not reach the native bundle at all.
//
// A route's `prerender` flag only decides whether its *HTML* is emitted. The
// route module still compiles into the client bundle: its JS chunk ships,
// `entry/app.*` still lists the route, and adapter-static's `fallback:
// '200.html'` means a WebView navigated there would render whatever the chunk
// contains. So a route can be absent from the static export and still have
// every string in it sitting inside the .ipa and .aab, where a store reviewer's
// string scan finds them.
//
// That gap is why the entries below are here rather than relying on their
// `prerender` flags:
//
//  * `beta` — both enrollment tabs: Play Store URLs and the testers' group link
//    (Google Play references inside an iOS binary are an App Review 2.3.10
//    rejection) plus the TestFlight public invitation and App Store link. An
//    enrollment page for the app already being used is web-only by design.
//  * `android-beta`, `ios-beta` — the deprecated solo paths, now redirects into
//    `beta`. Nothing to enroll into from inside the app either way.
//  * `admin` — the token-minting console's markup and copy. A privileged
//    surface shipped inside a children's app is what Play's Deceptive Behavior
//    policy and App Review 2.3.1 are written against, and the console is
//    web-only by design (ADR-0101).
//  * `feedback` — the standalone form depends on a server action and exposes a
//    conditional email fallback. Native links open the hosted form behind the
//    external-link gate instead.
//  * `dev` — the dev harnesses (`/dev`, `/dev/engine`, `/dev/store-frames`).
//    The runtime gate (`requireDevHarness`) 404s them, but their chunks —
//    including the store-frames marketing copy and the engine debug surface —
//    would otherwise ride along in every .ipa and .aab for a string scan to
//    find.
//
// This replaces each excluded route's client module source at build time, so
// the strings never make it into the bundle in the first place.
// `tools/mobile/check-static-bundle.mjs` scans the built output and fails
// `build:cap` if a sentinel from any excluded route survives.
export const NATIVE_EXCLUDED_ROUTES = [
  'beta',
  'android-beta',
  'ios-beta',
  'admin',
  'feedback',
  'dev',
] as const;

// Only the client-facing route modules are replaced. `+page.server.ts` and
// friends never reach the client bundle, and they own declarations the build
// still needs — /admin's `prerender = false` lives there, and stubbing it would
// pull the route back into the static export it is meant to be absent from.
const CLIENT_ROUTE_MODULES = /\/\+(page|layout)(\.svelte|\.ts|\.js)$/;

// Enough of a page module to satisfy SvelteKit's route contract while rendering
// nothing. `prerender = false` keeps the emptied route out of the static export
// (adapter-static's `strict: false` allows the gap) instead of emitting a blank
// document for it.
const EMPTY_PAGE_MODULE = 'export const prerender = false;\n';
const EMPTY_PAGE_COMPONENT = '';

function routeDirectorySegments(): string[] {
  return NATIVE_EXCLUDED_ROUTES.map((route) => `/src/routes/${route}/`);
}

/**
 * Vite plugin: blank out {@link NATIVE_EXCLUDED_ROUTES} when building the native
 * bundle. Inert on the web build, where those routes ship normally.
 */
export function excludeNativeRoutes(isCapacitor: boolean): Plugin {
  const segments = routeDirectorySegments();
  return {
    name: 'splotch:exclude-native-routes',
    // Ahead of the SvelteKit/Svelte plugins so they compile the stub rather than
    // the real module.
    enforce: 'pre',
    apply: () => isCapacitor,
    load(id) {
      const path = id.split('?')[0];
      if (!segments.some((segment) => path.includes(segment))) return null;
      if (!CLIENT_ROUTE_MODULES.test(path)) return null;
      return path.endsWith('.svelte') ? EMPTY_PAGE_COMPONENT : EMPTY_PAGE_MODULE;
    },
  };
}
