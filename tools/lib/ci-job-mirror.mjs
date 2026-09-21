// Runs one CI job's commands locally, in the job's order, and — unlike CI —
// keeps going after a failure so one run surfaces every problem instead of one
// per push. Each mirror script owns its command list; a guard test per script
// reads the job's steps out of .github/workflows/test.yml and fails on drift,
// because a YAML workflow can't import from a Node module.
import { spawnSync } from 'node:child_process';
import { ROOT } from './proc.mjs';

function runCommand(command) {
  console.log(`\n[1m$ ${command}[0m`);
  const { status } = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
  return status === 0;
}

export function runJobCommands(commands, { run = runCommand } = {}) {
  return commands.filter((command) => !run(command));
}

export function summarizeJob(label, commands, failures, log = console) {
  if (!failures.length) {
    log.log(`\n✓ ${label}: all ${commands.length} checks passed`);
    return 0;
  }
  log.error(`\n✗ ${label}: ${failures.length} of ${commands.length} checks failed`);
  for (const command of failures) log.error(`    ${command}`);
  return 1;
}
