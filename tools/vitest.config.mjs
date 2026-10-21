import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { RSD_NATIVE_RENDERER_TESTS } from './migration/lib/rsd-drawing-checks.mjs';

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
  RSD_NATIVE_RENDERER_TESTS,
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
            // react-native-svg's web elements resolve image hrefs through a .web.js module that
            // only a web bundler's platform extensions select; Node would load the native one.
            {
              find: /^(\.\.\/)+lib\/resolveAssetUri$/,
              replacement: fileURLToPath(
                new URL(
                  '../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js',
                  import.meta.url
                )
              ),
            },
            // The native line art reads its shipped SVG through expo-file-system and React Native,
            // which Node cannot load; native-bundled-text.test.mjs imports the real module by path.
            {
              find: /^\.\.\/platform\/bundledText\.native$/,
              replacement: fileURLToPath(
                new URL('./tests/native-bundled-text-stub.mjs', import.meta.url)
              ),
            },
            {
              find: /^@react-native\/assets-registry\/registry$/,
              replacement: fileURLToPath(
                new URL('./tests/native-svg-assets-registry-stub.mjs', import.meta.url)
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
