import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  RSD_NATIVE_SELECTION_TEST,
  RSD_NATIVE_RECOVERY_TEST,
  RSD_NATIVE_APPEARANCE_TEST,
  RSD_NATIVE_FEEDBACK_TEST,
  RSD_NATIVE_AI_TEST,
  RSD_NATIVE_PARENT_CENTER_TEST,
  RSD_NATIVE_ORIENTATION_TEST,
  RSD_NATIVE_TOOLBAR_TEST,
  RSD_NATIVE_CLEAR_TEST,
  RSD_NATIVE_INSTALL_BANNER_TEST,
  RSD_NATIVE_SETTINGS_SECTIONS_TEST,
  RSD_NATIVE_BUTTON_SIZE_TEST,
  RSD_NATIVE_TOKEN_SPECIMEN_TEST,
  RSD_NATIVE_BUTTON_TEST,
  RSD_NATIVE_ICON_BUTTON_TEST,
  RSD_NATIVE_BUTTON_CHROME_TEST,
  RSD_NATIVE_SEGMENTED_PICKER_TEST,
  RSD_NATIVE_SLIDER_TEST,
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
  RSD_NATIVE_ORIENTATION_TEST,
  RSD_NATIVE_TOOLBAR_TEST,
  RSD_NATIVE_CLEAR_TEST,
  RSD_NATIVE_INSTALL_BANNER_TEST,
  RSD_NATIVE_SETTINGS_SECTIONS_TEST,
  RSD_NATIVE_BUTTON_SIZE_TEST,
  RSD_NATIVE_TOKEN_SPECIMEN_TEST,
  RSD_NATIVE_BUTTON_TEST,
  RSD_NATIVE_ICON_BUTTON_TEST,
  RSD_NATIVE_BUTTON_CHROME_TEST,
  RSD_NATIVE_SEGMENTED_PICKER_TEST,
  RSD_NATIVE_SLIDER_TEST,
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
        // Native ink renders through Skia's native module, which Node cannot load; mounted
        // drawing tests exercise contacts and ink against the SVG renderer the web build ships.
        resolve: {
          alias: [
            {
              find: /^\.\/InkLayer$/,
              replacement: fileURLToPath(
                new URL(
                  '../experiments/native-architecture/src/drawing/InkLayer.web.tsx',
                  import.meta.url
                )
              ),
            },
            // Native halos draw through the same Skia module and Reanimated's UI runtime;
            // native-skia-halos.test.mjs swaps them back in with both mocked.
            {
              find: /^\.\/PointerHalos$/,
              replacement: fileURLToPath(
                new URL(
                  '../experiments/native-architecture/src/drawing/PointerHalos.web.tsx',
                  import.meta.url
                )
              ),
            },
            // The iOS Pencil emitter is a bridge module mounted screens never reach in Node;
            // native-pencil-double-tap.test.mjs imports the iOS adapter by its full path.
            {
              find: /^\.\.\/platform\/pencilDoubleTap$/,
              replacement: fileURLToPath(
                new URL(
                  '../experiments/native-architecture/src/platform/pencilDoubleTap.web.ts',
                  import.meta.url
                )
              ),
            },
          ],
        },
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
