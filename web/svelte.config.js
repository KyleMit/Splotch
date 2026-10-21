import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { buildMetadataOncePerProcess } from './buildVersion.ts';
import { CSRF_TRUSTED_ORIGINS, nativeCspDirectives, WEB_CSP_DIRECTIVES } from './securityPolicy.ts';
import { standalonePageEntries } from './standalonePageEntries.ts';

// The web app ships to Netlify (SSR for the /admin token console and /feedback;
// the /api/* endpoints are separate functions in netlify/functions). The native
// apps bundle a fully static export instead, so when CAPACITOR=true we swap in
// adapter-static. The server-only routes (admin, dev) aren't reachable inside the
// bundle and are skipped by `strict: false`; the native AI button talks to the
// hosted endpoint instead.
const isCapacitor = process.env.CAPACITOR === 'true';
const { appVersion } = buildMetadataOncePerProcess({ isCapacitor, env: process.env });

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    alias: standalonePageEntries(isCapacitor),
    version: { name: appVersion },
    // Hashes protect prerendered pages through a CSP meta tag; per-response
    // nonces protect SSR pages. The Netlify/SSR security-header layer supplies
    // the directives that meta delivery cannot express without overriding this
    // resource policy (ADR-0073).
    csp: {
      mode: 'auto',
      directives: isCapacitor ? nativeCspDirectives() : WEB_CSP_DIRECTIVES,
    },
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
    // The /api/* endpoints are Netlify Functions that repeat this guard
    // (src/lib/server/csrf.ts); here it covers SvelteKit's own form actions,
    // /feedback and /admin. securityPolicy.ts says why each origin is trusted.
    csrf: { trustedOrigins: [...CSRF_TRUSTED_ORIGINS] },
  },
};

export default config;
