import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the asset-gen pipeline's pure image-analysis
// helpers (sharp + committed fixtures, no Gemini/network). Separate from the
// web suite (web/vitest.config.ts, happy-dom): those import Svelte runes and a
// DOM; these read raw pixels and must run under Node. Root the config at this
// folder so `tests/**` and relative `lib/*` imports resolve from here, and so
// bare `sharp` resolves upward to the repo-root node_modules (ADR-0029).
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
});
