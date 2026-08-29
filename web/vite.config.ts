import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildDefines } from './defines';
import { BROWSER_TARGETS } from './browserTargets';
import { buildMetadata } from './buildVersion';
import {
  RESPONSIVE_COLORING_URL_PATTERN,
  serveResponsiveColoringWithCanonicalFallback,
} from './src/lib/pwa/coloringFallback';
import { VERSION_JSON_FILENAME } from './src/lib/pwa/versionEndpoint';
import {
  BOOKS,
  RESPONSIVE_COLORING_TIER_DIRECTORIES,
  STARTER_COLORING_BOOK_ID,
} from './src/lib/state/books';
import { excludeNativeRoutes } from './nativeExcludedRoutes';
import { buildColoringPackManifest } from './coloringPackManifest';
import { nativeApiBaseFor } from './securityPolicy.ts';
import {
  COLORING_PACK_ASSET_URL_PATTERN,
  serveInstalledColoringPackAsset,
} from './src/lib/pwa/coloringPackRoute';

// The native apps bundle a static export and never use a service worker (the
// shell and all assets are already on-device), so skip the PWA plugin there.
const isCapacitor = process.env.CAPACITOR === 'true';
const responsiveColoringGlobIgnores = RESPONSIVE_COLORING_TIER_DIRECTORIES.map(
  (directory) => `${directory.slice(1)}/**/*`
);

// Opt-in `performance.mark/measure` instrumentation on the drawing engine's hot
// paths, read by the profiling harness (tools/perf/, `npm run perf:web`). Off
// by default so the marks never ship: with the literal `false` the guarded
// blocks — and their mark-name strings — dead-code-eliminate from the bundle.
const perfMarks = process.env.PERF_MARKS === 'true';
const devHarness = process.env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
const profilingEsbuildOptions: import('vite').ESBuildOptions & {
  keepNames: boolean;
} = { keepNames: true };

// Version semantics: ADR-0030; derivation + fallbacks live in ./buildVersion.ts.
const { appVersion: APP_VERSION, buildTime: BUILD_TIME } = buildMetadata({ isCapacitor });

// On a native device there is no local server, so the AI button must call the
// hosted endpoint. On the web this stays empty and the relative path is used.
const NATIVE_API_BASE = nativeApiBaseFor(isCapacitor);
const coloringPackManifest = buildColoringPackManifest(APP_VERSION, isCapacitor ? 'mobile' : 'web');
const downloadableColoringGlobIgnores = BOOKS.filter(
  (book) => book.id !== STARTER_COLORING_BOOK_ID
).map((book) => `coloring/${book.id}/**/*`);

// Generated rather than committed, so every consumer reads this one list: the
// build emits them as assets and the dev server serves them from memory.
const BUILD_MANIFEST_ASSETS = [
  { fileName: VERSION_JSON_FILENAME, source: JSON.stringify({ version: APP_VERSION }) },
  { fileName: coloringPackManifest.fileName, source: coloringPackManifest.source },
];

export default defineConfig({
  server: {
    // Every executable consumer of this port — netlify.toml, dev:stop,
    // start-cloud-tunnel, the emulator/simulator live-reload runs, and adb:reverse —
    // is guarded against it by tools/tests/dev-ports.test.mjs.
    port: 5173,
    strictPort: true,
    // Allow a phone-preview reverse tunnel (e.g. chisel) to forward in under its
    // own hostname; no effect on normal dev/build, only when TUNNEL_HOST is set.
    ...(process.env.TUNNEL_HOST ? { allowedHosts: [process.env.TUNNEL_HOST] } : {}),
  },
  define: buildDefines({
    appVersion: APP_VERSION,
    buildTime: BUILD_TIME,
    nativeApiBase: NATIVE_API_BASE,
    isCapacitor,
    perfMarks,
    devHarness,
  }),
  build: { target: BROWSER_TARGETS },
  // Profiling builds (PERF_MARKS=true) keep function names through minification
  // so the trace's CPU-sampler self-time is readable instead of mangled (`ci`).
  // No effect on shipping builds.
  ...(perfMarks
    ? {
        esbuild: profilingEsbuildOptions,
      }
    : {}),
  plugins: [
    excludeNativeRoutes(isCapacitor),
    sveltekit(),
    // Emit a version.json on every build so the running app can detect
    // when the deployed version has moved on and force a fresh fetch.
    {
      name: 'emit-build-manifests',
      generateBundle() {
        for (const { fileName, source } of BUILD_MANIFEST_ASSETS) {
          this.emitFile({ type: 'asset', fileName, source });
        }
      },
      // generateBundle is a build-only hook, so without this middleware both
      // URLs 404 under `vite dev`: the coloring-pack manager's very first fetch
      // fails and no book ever installs. Serving the identical bytes off the
      // one BUILD_MANIFEST_ASSETS list keeps dev and prod from drifting, which
      // tools/page-inventory captures against dev and depends on.
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const { pathname } = new URL(request.url ?? '/', 'http://localhost');
          const asset = BUILD_MANIFEST_ASSETS.find(({ fileName }) => pathname === `/${fileName}`);
          if (!asset) return next();
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(asset.source);
        });
      },
    },
    ...(isCapacitor
      ? []
      : [
          VitePWA({
            // 'prompt' disables vite-plugin-pwa's own auto-send-SKIP_WAITING /
            // auto-reload, leaving updates.ts as the sole driver. This preserves
            // the canvas-empty guard (never interrupt a mid-drawing session).
            registerType: 'prompt',
            // No auto-injected registerSW.js: the precache includes the app shell and
            // starter coloring book, and a window.load registration would
            // saturate a slow connection right as boot's idle-deferred work runs
            // and the child starts drawing. updates.ts registers the SW itself —
            // deferred behind the stroke-count + idle gate on a first visit,
            // immediately at idle on a repeat visit (issue #462).
            injectRegister: null,
            includeAssets: [
              'favicon.ico',
              'favicon-96x96.png',
              'apple-touch-icon.png',
              'sounds/*.mp3',
            ],
            manifest: false,
            workbox: {
              additionalManifestEntries: [
                { url: '_app/env.js', revision: BUILD_TIME },
                {
                  url: coloringPackManifest.fileName,
                  revision: coloringPackManifest.revision,
                },
              ],
              // Exclude html — navigation requests use the NetworkFirst runtime
              // cache below so a manual refresh always fetches fresh markup.
              globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}'],
              globIgnores: [
                // The social card is served but never fetched by the application.
                'large-image.png',
                '**/*.outline.webp',
                '**/*.chalk.webp',
                ...responsiveColoringGlobIgnores,
                ...downloadableColoringGlobIgnores,
              ],
              // Do NOT set skipWaiting here. The new SW enters "waiting" state
              // and updates.ts activates it (via SKIP_WAITING message) only when
              // the canvas is blank, so mid-drawing sessions are never disrupted.
              clientsClaim: true,
              // vite-plugin-pwa defaults navigateFallback to 'index.html', which
              // would register a CacheFirst NavigationRoute that shadows our
              // NetworkFirst handler. Override to '' to suppress it.
              navigateFallback: '',
              runtimeCaching: [
                {
                  urlPattern: RESPONSIVE_COLORING_URL_PATTERN,
                  handler: serveResponsiveColoringWithCanonicalFallback,
                },
                {
                  urlPattern: COLORING_PACK_ASSET_URL_PATTERN,
                  handler: serveInstalledColoringPackAsset,
                },
                {
                  urlPattern: ({ request }) => request.mode === 'navigate',
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'pages',
                    // After five seconds stalled navigations with a cached page use it
                    // instead of leaving a child waiting for a load that may not finish.
                    networkTimeoutSeconds: 5,
                  },
                },
              ],
            },
          }),
        ]),
  ],
});
