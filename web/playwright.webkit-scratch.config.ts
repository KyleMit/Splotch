// Scratch config: run selected specs under WebKit to chase Safari-only input
// bugs. Not part of `npm test` — invoke explicitly with
//   node tools/run-web-tool.mjs playwright test -c playwright.webkit-scratch.config.ts -g "<test>"
import { defineConfig, devices } from '@playwright/test';
import {
  commonPlaywrightConfig,
  commonWebServer,
  productionPreviewCommand,
} from './playwright.shared';

export default defineConfig({
  ...commonPlaywrightConfig,
  reporter: [['list']],
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    ...commonWebServer,
    command: productionPreviewCommand,
    reuseExistingServer: false,
  },
});
