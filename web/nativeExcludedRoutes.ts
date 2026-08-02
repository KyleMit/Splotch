import type { Plugin } from 'vite';

// Routes that must not reach the native bundle at all.
//
// A route's own `prerender = !__IS_CAPACITOR__` drops its *HTML* from the static
// export, but the route module still compiles into the client bundle: its JS
// chunk ships, `entry/app.*` still lists the route, and adapter-static's
// `fallback: '200.html'` means a WebView navigated there renders it. So every
// string in the module — for /android-beta, Play Store URLs, the testers' group
// link, and the support address — is present in the .ipa and .aab and turns up
// in a store reviewer's string scan. Google Play references inside an iOS binary
// are an App Review 2.3.10 rejection on their own.
//
// This replaces each excluded route's module source at build time, so the
// strings never make it into the bundle in the first place. `nativeBundleScan`
// (scripts/check-native-bundle.mjs) proves it against the built output.
export const NATIVE_EXCLUDED_ROUTES = ['android-beta'] as const;

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
      if (path.endsWith('.svelte')) return EMPTY_PAGE_COMPONENT;
      if (path.endsWith('.ts') || path.endsWith('.js')) return EMPTY_PAGE_MODULE;
      return null;
    },
  };
}
