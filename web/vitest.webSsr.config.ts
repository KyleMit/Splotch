import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { unitTestDefines, WEB_SSR_TESTS } from './vitest.config';

// Web-build SSR guards: the same SvelteKit compile and client-runtime resolution
// as the unit config (vitest.config.ts explains both), with `__IS_CAPACITOR__`
// false so the web-only render branches the Netlify SSR bundle ships are the
// ones exercised. No setup file: the unit setup pins `browser` true, which these
// tests must not inherit.
export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ['browser'] },
  define: unitTestDefines(false),
  test: {
    environment: 'node',
    pool: 'threads',
    include: [WEB_SSR_TESTS],
  },
});
