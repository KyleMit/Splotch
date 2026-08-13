import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the repo tooling. Separate from the web
// suite (web/vitest.config.ts, happy-dom): these are plain Node helpers with no
// DOM. Rooted at this folder so both the central `tests/**` drift guards and
// each capability's own `<capability>/tests/**` resolve their relative imports
// from here — same pattern as tools/asset-gen/vitest.config.mjs.
//
// asset-gen and store-drawings are excluded: they keep separately named suites
// (test:asset-gen, test:store-drawings) that npm test already runs.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: [
      'tests/**/*.test.mjs',
      '*/tests/**/*.test.mjs',
      'mobile/{android,ios}/tests/**/*.test.mjs',
    ],
    exclude: ['asset-gen/**', 'store-drawings/**'],
  },
});
