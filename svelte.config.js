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
      : adapterNetlify()
  }
};

export default config;
