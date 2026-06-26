import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The native apps bundle a static export and never use a service worker (the
// shell and all assets are already on-device), so skip the PWA plugin there.
const isCapacitor = process.env.CAPACITOR === 'true';

// Opt-in `performance.mark/measure` instrumentation on the drawing engine's hot
// paths, read by the profiling harness (scripts/perf/, `npm run perf:web`). Off
// by default so the marks never ship: with the literal `false` the guarded
// blocks — and their mark-name strings — dead-code-eliminate from the bundle.
const perfMarks = process.env.PERF_MARKS === 'true';

// package.json (at the repo root, one dir up from web/) holds the canonical
// major.minor, bumped by scripts/release.mjs. Native keeps that exact version —
// store submissions need deliberate, controlled numbers. The web build instead
// auto-derives the patch from git so every push to main gets a fresh version
// (so /version.json moves and the PWA stuck-client recovery stays live):
//   major.minor.<commits since the last release tag>   e.g. 1.2.45
// Netlify's deploy uses a blobless clone (full history + tags, only file blobs
// deferred), so `git describe` works on prod. If history/tags are ever missing
// we fall back to major.minor.0+<sha> — still unique per commit, never a stale
// bare version. BUILD_TIME is kept separately for debugging.
const PKG_VERSION = JSON.parse(readFileSync('../package.json', 'utf8')).version;
const BUILD_TIME = new Date().toISOString().slice(0, 16).replace('T', ' ');

function git(args: string): string {
  return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function webVersion(pkg: string): string {
  const [major, minor] = pkg.split('.');
  try {
    // e.g. "v1.2.0-45-gabc1234" — 45 commits since the last release tag.
    const match = git('describe --tags --long --match "v*"').match(/-(\d+)-g[0-9a-f]+$/);
    if (match) return `${major}.${minor}.${match[1]}`;
  } catch {
    // no reachable tag — fall through to the SHA-based marker
  }
  try {
    return `${major}.${minor}.0+${git('rev-parse --short HEAD')}`;
  } catch {
    return pkg;
  }
}

const APP_VERSION = isCapacitor ? PKG_VERSION : webVersion(PKG_VERSION);

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
    __NATIVE_API_BASE__: JSON.stringify(NATIVE_API_BASE),
    __IS_CAPACITOR__: JSON.stringify(isCapacitor),
    __PERF_MARKS__: JSON.stringify(perfMarks)
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
