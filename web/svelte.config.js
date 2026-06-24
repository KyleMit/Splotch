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
    // adapterNetlify() (no opts) emits SSR as a Node serverless function. If we ever pass
    // { edge: true } to run SSR on Netlify's Deno edge runtime, un-ignore and commit deno.lock
    // (currently gitignored) so the edge runtime pins are reproducible.
    adapter: isCapacitor
      ? adapterStatic({ fallback: '200.html', strict: false })
      : adapterNetlify(),
    // Inline all CSS into the prerendered <head> so component-scoped styles
    // (e.g. the swatch / clear-button border-radius) are present at first paint.
    // Otherwise iPadOS's WebView paints the unstyled square first and the
    // element's own border-radius transition animates the square->round "snap"
    // (FOUC). Infinity inlines every CSS file regardless of size.
    inlineStyleThreshold: Infinity,
    // The native apps load from a WebView origin and call the hosted
    // /api/generate-image cross-origin. SvelteKit's CSRF guard otherwise rejects
    // that multipart POST with a 403 ("Cross-site form submissions are forbidden")
    // *before* hooks.server.js can add CORS headers, so the WebView surfaces it as
    // a CORS failure. Trust the Capacitor origins (Android: https://localhost,
    // iOS: capacitor://localhost). Safe here: the AI route is token-gated, and
    // /admin's only cookie is SameSite=strict, so it's never sent on the
    // cross-site requests these trusted origins make.
    csrf: { trustedOrigins: ['https://localhost', 'capacitor://localhost'] }
  }
};

export default config;
