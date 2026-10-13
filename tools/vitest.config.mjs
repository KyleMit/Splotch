import { defineConfig } from 'vitest/config';
import {
  RSD_NATIVE_SELECTION_TEST,
  RSD_NATIVE_RECOVERY_TEST,
  RSD_NATIVE_APPEARANCE_TEST,
  RSD_NATIVE_FEEDBACK_TEST,
  RSD_NATIVE_AI_TEST,
  RSD_NATIVE_PARENT_CENTER_TEST,
  RSD_NATIVE_TOOLBAR_TEST,
  RSD_NATIVE_INSTALL_BANNER_TEST,
} from './migration/lib/rsd-drawing-checks.mjs';

// Node-environment unit tests for the repo tooling. Separate from the web
// suite (web/vitest.config.ts, happy-dom): these are plain Node helpers with no
// DOM. Rooted at this folder so both the central `tests/**` drift guards and
// each capability's own `<capability>/tests/**` resolve their relative imports
// from here — same pattern as tools/asset-gen/vitest.config.mjs.
//
// Opt-in capabilities keep separately named suites. centerline-tracing is also
// excluded from npm test because its checks require uv and an isolated Python environment.
const CAPABILITY_EXCLUSIONS = [
  'asset-gen/**',
  'centerline-tracing/**',
  'store-drawings/**',
  RSD_NATIVE_SELECTION_TEST,
  RSD_NATIVE_RECOVERY_TEST,
  RSD_NATIVE_APPEARANCE_TEST,
  RSD_NATIVE_FEEDBACK_TEST,
  RSD_NATIVE_AI_TEST,
  RSD_NATIVE_PARENT_CENTER_TEST,
  RSD_NATIVE_TOOLBAR_TEST,
  RSD_NATIVE_INSTALL_BANNER_TEST,
];

export default defineConfig({
  root: import.meta.dirname,
  test: {
    projects: [
      {
        extends: false,
        root: import.meta.dirname,
        // Expo and React Native sources read Metro's __DEV__ global at import time.
        define: { __DEV__: 'false' },
        test: {
          name: 'repo-tools',
          environment: 'node',
          include: ['**/tests/**/*.test.mjs'],
          exclude: CAPABILITY_EXCLUSIONS,
        },
      },
    ],
  },
});
