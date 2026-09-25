import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the asset-gen pipeline's pure image-analysis
// helpers (sharp + committed fixtures, no Gemini/network). Separate from the
// web suite (web/vitest.config.ts, happy-dom): those import Svelte runes and a
// DOM; these read raw pixels and must run under Node. Root the config at this
// folder so `tests/**` and relative `lib/*` imports resolve from here, and so
// bare `sharp` resolves upward to the repo-root node_modules (ADR-0029).

// These tests decode and score full-size fixture images: several take 2–5 s
// locally against Vitest's 5 s default, and a 4-core CI runner has run one past
// 15 s. A test that sets its own timeout still overrides this.
const ASSET_GEN_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
    testTimeout: ASSET_GEN_TEST_TIMEOUT_MS,
  },
});
