import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the repo automation scripts. Separate from
// the web suite (web/vitest.config.ts, happy-dom): these are plain Node
// helpers with no DOM. Rooted at this folder so `tests/**` and the scripts'
// relative imports resolve from here — same pattern as
// tools/asset-gen/vitest.config.mjs.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
});
