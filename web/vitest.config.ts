import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Unit-test config, separate from the Playwright E2E suite (`npm test`).
// The SvelteKit plugin gives us the `$lib` / `$app/*` aliases and, crucially,
// compiles the runes in `*.svelte.ts` state modules so they can be imported
// here just like the app imports them. happy-dom supplies localStorage + DOM
// for the storage/state layers.
export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0-test'),
    __BUILD_TIME__: JSON.stringify('2026-01-01T00:00:00Z'),
    __NATIVE_API_BASE__: JSON.stringify('')
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    // The Playwright specs live under tests/ and must not be picked up here.
    exclude: ['tests/**', 'node_modules/**', '.svelte-kit/**']
  }
});
