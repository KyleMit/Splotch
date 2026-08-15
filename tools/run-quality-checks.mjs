// Runs CI's Quality job locally, in its order, and — unlike CI — keeps going
// after a failure so one run surfaces every problem instead of one per push.
// `npm test` covers the test jobs; this covers the other half of the gate.
//
// QUALITY_COMMANDS must stay in step with .github/workflows/test.yml. A YAML
// workflow can't import from a Node module, so the agreement is enforced by
// tools/tests/run-quality-checks.test.mjs, which reads the steps out of the
// workflow and fails when either side gains, loses, or reorders a command.
import { spawnSync } from 'node:child_process';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

export const QUALITY_COMMANDS = [
  'npm run format:check',
  'npm run check',
  'npm run lint',
  'npm run check:svg-assets',
  'npm run ruler:check',
  'npm run gen:tokens:check',
  'npm run lint:tokens',
  'npm run lint:dead',
  'npm run check:assets:manifest',
  'npm run scrapbook:check',
  'pnpm audit --audit-level=critical',
];

function runCommand(command) {
  console.log(`\n[1m$ ${command}[0m`);
  const { status } = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
  return status === 0;
}

export function summarize(failures, log = console) {
  if (!failures.length) {
    log.log(`\n✓ Quality: all ${QUALITY_COMMANDS.length} checks passed`);
    return 0;
  }
  log.error(`\n✗ Quality: ${failures.length} of ${QUALITY_COMMANDS.length} checks failed`);
  for (const command of failures) log.error(`    ${command}`);
  return 1;
}

export function runQualityChecks({ run = runCommand } = {}) {
  return QUALITY_COMMANDS.filter((command) => !run(command));
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    process.exitCode = summarize(runQualityChecks());
  });
}
