// Mirrors CI's Browserless tests job locally — every Vitest tier plus the API
// contract smoke, without the Playwright suite that `npm test` adds and with
// the smoke that `npm test` omits. BROWSERLESS_TEST_COMMANDS must stay in step
// with .github/workflows/test.yml, enforced by tests/run-browserless-tests.test.mjs;
// tools/ci-mirror/README.md explains the capability.
import { isMain, runMain } from '../lib/proc.mjs';
import { runJobCommands, summarizeJob } from './lib/job-mirror.mjs';

export const BROWSERLESS_TEST_COMMANDS = [
  'npm run test:unit:coverage',
  'npm run test:asset-gen',
  'npm run test:store-drawings',
  'npm run test:tools',
  'npm run test:api:smoke',
];

export function summarize(failures, log = console) {
  return summarizeJob('Browserless tests', BROWSERLESS_TEST_COMMANDS, failures, log);
}

export function runBrowserlessTests({ run } = {}) {
  return runJobCommands(BROWSERLESS_TEST_COMMANDS, { run });
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    process.exitCode = summarize(runBrowserlessTests());
  });
}
