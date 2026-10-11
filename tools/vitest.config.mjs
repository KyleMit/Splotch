import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the repo tooling. Separate from the web
// suite (web/vitest.config.ts, happy-dom): these are plain Node helpers with no
// DOM. Rooted at this folder so both the central `tests/**` drift guards and
// each capability's own `<capability>/tests/**` resolve their relative imports
// from here — same pattern as tools/asset-gen/vitest.config.mjs.
//
// Opt-in capabilities keep separately named suites. centerline-tracing is also
// excluded from npm test because its checks require uv and an isolated Python environment.
const JOINT_SOURCE_TEST = 'migration/tests/web-host-joint-source.test.mjs';
const JOINT_SOURCE_SEQUENCE_GROUP = 1;
const CAPABILITY_EXCLUSIONS = ['asset-gen/**', 'centerline-tracing/**', 'store-drawings/**'];

export default defineConfig({
  root: import.meta.dirname,
  test: {
    projects: [
      {
        extends: false,
        root: import.meta.dirname,
        test: {
          name: 'repo-tools',
          environment: 'node',
          include: ['**/tests/**/*.test.mjs'],
          exclude: [...CAPABILITY_EXCLUSIONS, JOINT_SOURCE_TEST],
        },
      },
      {
        extends: false,
        root: import.meta.dirname,
        test: {
          name: 'joint-native-source',
          environment: 'node',
          include: [JOINT_SOURCE_TEST],
          exclude: CAPABILITY_EXCLUSIONS,
          sequence: { groupOrder: JOINT_SOURCE_SEQUENCE_GROUP },
        },
      },
    ],
  },
});
