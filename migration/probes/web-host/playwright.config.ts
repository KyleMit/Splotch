import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import {
  commonWebServer,
  chromiumLaunchOptions,
  resolvePlaywrightPort,
} from '../../../web/playwright.shared';
import { WEB_HOST_ENV } from './host/contract';
import { readWebHostArtifact } from '../../../tools/migration/lib/web-host-artifact.mjs';
import { browserInvocationPaths } from '../../../tools/migration/lib/web-host-browser.mjs';

const { owned, copyRoot, artifact, request } = readWebHostArtifact(
  process.env[WEB_HOST_ENV.artifactRoot]
);
const invocation = browserInvocationPaths(owned, process.env[WEB_HOST_ENV.browserRun]);
const port = resolvePlaywrightPort(process.env[WEB_HOST_ENV.port]);
if (process.env[WEB_HOST_ENV.port] === undefined)
  throw new Error('Candidate browser config requires the selected explicit port');
const baseURL = `http://localhost:${port}`;
const BROWSER_SMOKE_DEADLOCK_CEILING_MS = 180_000;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTimeout: BROWSER_SMOKE_DEADLOCK_CEILING_MS,
  use: {
    baseURL,
    viewport: { width: 1024, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: invocation.outputDir,
  reporter: [['list'], ['html', { outputFolder: invocation.reportDir, open: 'never' }]],
  projects: [
    {
      name: `${request.variant}-chromium`,
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunchOptions() },
    },
  ],
  globalSetup: join(copyRoot, 'web/tests/global-setup.ts'),
  webServer: {
    command:
      'node --experimental-strip-types --disable-warning=ExperimentalWarning tools/migration/serve-web-host.mjs',
    cwd: copyRoot,
    url: baseURL,
    timeout: commonWebServer.timeout,
    reuseExistingServer: false,
    env: {
      ...commonWebServer.env,
      PUBLIC_ENABLE_DEV_HARNESS: artifact === 'mechanism' ? 'true' : 'false',
    },
  },
});
