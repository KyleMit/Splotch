import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Unit-test config, separate from the Playwright E2E suite (`npm test`).
// The SvelteKit plugin gives us the `$lib` / `$app/*` aliases and, crucially,
// compiles the runes in `*.svelte.js` state modules so they can be imported
// here just like the app imports them. happy-dom supplies localStorage + DOM
// for the storage/state layers.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest-setup.js'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    // The Playwright specs live under tests/ and must not be picked up here.
    exclude: ['tests/**', 'node_modules/**', '.svelte-kit/**']
  }
});
