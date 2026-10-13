import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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
  RSD_NATIVE_MODAL_FRAME_TEST,
  RSD_NATIVE_SEGMENTED_PICKER_TEST,
  RSD_NATIVE_SLIDER_TEST,
} from './lib/rsd-drawing-checks.mjs';
const require = createRequire(import.meta.url);
const repoRoot = join(import.meta.dirname, '..', '..');
const native = join(
  dirname(require.resolve('react-strict-dom/package.json')),
  'dist/native/index.js'
);
export default defineConfig({
  root: join(repoRoot, 'tools'),
  define: { __DEV__: 'false' },
  resolve: { alias: [{ find: /^react-strict-dom$/, replacement: native }] },
  test: {
    environment: 'happy-dom',
    include: [
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
      RSD_NATIVE_MODAL_FRAME_TEST,
      RSD_NATIVE_SEGMENTED_PICKER_TEST,
      RSD_NATIVE_SLIDER_TEST,
    ],
    server: { deps: { inline: [/react-strict-dom/] } },
  },
});
