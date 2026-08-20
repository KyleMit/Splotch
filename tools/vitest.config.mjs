import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the repo tooling. Separate from the web
// suite (web/vitest.config.ts, happy-dom): these are plain Node helpers with no
// DOM. Rooted at this folder so both the central `tests/**` drift guards and
// each capability's own `<capability>/tests/**` resolve their relative imports
// from here — same pattern as tools/asset-gen/vitest.config.mjs.
//
// Opt-in capabilities keep separately named suites. centerline-tracing is also
// excluded from npm test because its checks require uv and an isolated Python environment.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['**/tests/**/*.test.mjs'],
    exclude: ['asset-gen/**', 'centerline-tracing/**', 'store-drawings/**'],
  },
});
