// Mirrors CI's Quality job locally; tools/run-browserless-tests.mjs mirrors the
// Browserless tests job, the other non-browser half of the gate. How the mirror
// runs and why it keeps going past a failure: tools/lib/ci-job-mirror.mjs.
//
// QUALITY_COMMANDS must stay in step with .github/workflows/test.yml, enforced
// by tools/tests/run-quality-checks.test.mjs.
import { runJobCommands, summarizeJob } from './lib/ci-job-mirror.mjs';
import { isMain, runMain } from './lib/proc.mjs';

export const QUALITY_COMMANDS = [
  'npm run format:check',
  'npm run check',
  'npm run lint',
  'npm run lint:css',
  'npm run check:svg-assets',
  'npm run ruler:check',
  'npm run check:ideas-review',
  'npm run gen:tokens:check',
  'npm run lint:tokens',
  'npm run lint:dead',
  'npm run check:assets:manifest',
  'npm run scrapbook:check',
  'pnpm audit --audit-level=high',
];

export function summarize(failures, log = console) {
  return summarizeJob('Quality', QUALITY_COMMANDS, failures, log);
}

export function runQualityChecks({ run } = {}) {
  return runJobCommands(QUALITY_COMMANDS, { run });
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    process.exitCode = summarize(runQualityChecks());
  });
}
