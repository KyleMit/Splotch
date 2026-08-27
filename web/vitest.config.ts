import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { buildDefines } from './defines';

// Unit-test config, separate from the Playwright E2E suite (`npm test`).
// The SvelteKit plugin gives us the `$lib` / `$app/*` aliases and, crucially,
// compiles the runes in `*.svelte.ts` state modules so they can be imported
// here just like the app imports them. happy-dom supplies localStorage + DOM
// for the storage/state layers.
export default defineConfig({
  plugins: [sveltekit()],
  define: buildDefines({
    appVersion: '1.0.0-test',
    buildTime: '2026-01-01T00:00:00Z',
    nativeApiBase: '',
    // `true` keeps runtime native branches compiled in when they pair
    // `__IS_CAPACITOR__` with `isNative()`, so tests control those branches
    // through their isNative() mocks. Pure compile-time branches intentionally
    // dead-code-eliminate here and need source/build boundary coverage instead.
    isCapacitor: true,
    perfMarks: false,
    devHarness: false,
  }),
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/*TestHarness.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 83.8,
        branches: 74.5,
        functions: 85.6,
        lines: 86.4,
      },
    },
    // Worker threads spawn faster than the default child-process forks and
    // nothing here needs process-level isolation (no native modules in the
    // unit suite). Server-only and pure-logic test files opt out of the
    // happy-dom environment with a `@vitest-environment node` docblock —
    // per-file DOM setup is the suite's biggest fixed cost.
    pool: 'threads',
    setupFiles: ['./vitest-setup.ts'],
    // The root-level `*.test.ts` files cover the build-time modules that sit
    // beside them (buildVersion.ts) — no generated glob reaches them, so
    // tools/tests/web-root-unit-tests.test.mjs fails if this entry is dropped.
    include: ['src/**/*.{test,spec}.{js,ts}', '*.test.ts'],
    // The Playwright specs live under tests/ and must not be picked up here.
    exclude: ['tests/**', 'node_modules/**', '.svelte-kit/**'],
  },
});
