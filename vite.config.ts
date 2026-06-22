import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// The user-facing release version is the single source of truth in package.json
// (bumped by scripts/release.mjs). BUILD_TIME is kept separately for debugging.
const APP_VERSION = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const BUILD_TIME = new Date().toISOString().slice(0, 16).replace('T', ' ');

// The native apps bundle a static export and never use a service worker (the
// shell and all assets are already on-device), so skip the PWA plugin there.
const isCapacitor = process.env.CAPACITOR === 'true';

// On a native device there is no local server, so the AI button must call the
// hosted endpoint. On the web this stays empty and the relative path is used.
const NATIVE_API_BASE = isCapacitor ? 'https://splotch.art' : '';

export default {
  server: {
    port: 5173,
    strictPort: true,
    // Allow a phone-preview reverse tunnel (e.g. chisel) to forward in under its
    // own hostname; no effect on normal dev/build, only when TUNNEL_HOST is set.
    ...(process.env.TUNNEL_HOST ? { allowedHosts: [process.env.TUNNEL_HOST] } : {})
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __NATIVE_API_BASE__: JSON.stringify(NATIVE_API_BASE)
  },
  plugins: [
    sveltekit(),
    // Emit a version.json on every build so the running app can detect
    // when the deployed version has moved on and force a fresh fetch.
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
      }
    } satisfies import('vite').Plugin,
    ...(isCapacitor
      ? []
      : [
          VitePWA({
            // 'prompt' disables vite-plugin-pwa's own auto-send-SKIP_WAITING /
            // auto-reload, leaving updates.ts as the sole driver. This preserves
            // the canvas-empty guard (never interrupt a mid-drawing session).
            registerType: 'prompt',
            includeAssets: ['favicon.ico', 'favicon-96x96.png', 'apple-touch-icon.png', 'sounds/*.mp3'],
            manifest: false,
            workbox: {
              // Exclude html — navigation requests use the NetworkFirst runtime
              // cache below so a manual refresh always fetches fresh markup.
              globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}'],
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
                  urlPattern: ({ request }) => request.mode === 'navigate',
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'pages',
                    networkTimeoutSeconds: 5
                  }
                }
              ]
            }
          })
        ])
  ]
};
