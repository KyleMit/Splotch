import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// The web app ships to Netlify (SSR + the /api/generate-image function and the
// /admin token console). The native apps bundle a fully static export instead,
// so when CAPACITOR=true we swap in adapter-static. The server-only routes
// (api, admin, dev) aren't reachable inside the bundle and are skipped by
// `strict: false`; the native AI button talks to the hosted endpoint instead.
const isCapacitor = process.env.CAPACITOR === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: isCapacitor
      ? adapterStatic({ fallback: '200.html', strict: false })
      : adapterNetlify(),
    // The native apps load from a WebView origin and call the hosted
    // /api/generate-image cross-origin. SvelteKit's CSRF guard otherwise rejects
    // that multipart POST with a 403 ("Cross-site form submissions are forbidden")
    // *before* hooks.server.js can add CORS headers, so the WebView surfaces it as
    // a CORS failure. Trust the Capacitor origins (Android: https://localhost,
    // iOS: capacitor://localhost). Safe here: no endpoint uses ambient cookies —
    // the AI route is token-gated, /admin takes its key in the query string.
    csrf: { trustedOrigins: ['https://localhost', 'capacitor://localhost'] }
  }
};

export default config;
