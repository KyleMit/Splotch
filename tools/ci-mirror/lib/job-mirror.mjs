// Runs one CI job's commands locally, in the job's order, and — unlike CI —
// keeps going after a failure so one run surfaces every problem instead of one
// per push.
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../lib/proc.mjs';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function runCommand(command) {
  console.log(`\n${BOLD}$ ${command}${RESET}`);
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
