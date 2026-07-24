// overnight.mjs — launch an unattended burndown that survives until morning.
//
//   npm run audit:burndown:overnight -- 600
//
// Holds a macOS sleep assertion for exactly the lifetime of the job
// (caffeinate with the job as its child — released automatically on exit) and
// runs under tmux so a closed terminal doesn't SIGHUP it. `caffeinate -s` is
// only valid on AC power, so stay plugged in; with the lid closed you also
// need `sudo pmset -a disablesleep 1` (and `... 0` afterwards).

import { spawn, spawnSync } from 'node:child_process';
import { openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { hasCommand, sleep } from '../lib/utils.mjs';
import { chdirRoot, ensureWorkDirs, LOGS, runCmd, WORK } from './lib.mjs';

chdirRoot();
ensureWorkDirs();

const count = process.argv[2] ?? '600';
const session = 'burndown';

const preflight = spawnSync(process.execPath, ['scripts/audit-burndown/preflight.mjs'], {
  stdio: 'inherit',
});
if (preflight.status !== 0) {
  console.error('preflight failed — not launching');
  process.exit(1);
}

rmSync(join(WORK, 'STOP'), { force: true });

// Forward the burndown's env knobs into the job command itself, not just this
// process's env — `tmux new-session` does not reliably inherit the caller's
// arbitrary environment, so an override like E2E_CMD would silently vanish under
// tmux and the run would use defaults (e.g. hit the flaky-screenshot gate and
// never push). Baking them into the command makes overrides work on both paths.
const KNOBS = [
  'PUSH_EVERY',
  'BRANCH',
  'CHECK_CMD',
  'TEST_CMD',
  'E2E_CMD',
  'LINT_CMD',
  'PUSH_TEST_CMD',
  'MAX_DEFERRALS',
  'RETRIES',
  'MODEL_VERIFY',
  'MODEL_IMPL',
  'MODEL_REVIEW',
  'BUDGET_VERIFY',
  'BUDGET_IMPL',
  'BUDGET_REVIEW',
];
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const forwarded = KNOBS.filter((k) => process.env[k] != null).map(
  (k) => `${k}=${shq(process.env[k])}`
);

// -i prevents idle system sleep, -m keeps the disk awake, -s prevents system
// sleep (AC power only).
const envPrefix = [`MAX_ISSUES=${count}`, ...forwarded].join(' ');
const job = `env ${envPrefix} node scripts/audit-burndown/burndown.mjs`;
const cmd = process.platform === 'darwin' ? `caffeinate -ims ${job}` : job;

if (hasCommand('tmux')) {
  spawnSync('tmux', ['new-session', '-d', '-s', session, cmd], { stdio: 'inherit' });
  console.log(`launched in tmux session '${session}'`);
  console.log(`  attach:  tmux attach -t ${session}`);
  console.log('  status:  npm run audit:status');
  console.log('  cost:    npm run audit:cost');
  console.log(`  stop:    touch ${WORK}/STOP`);
} else {
  console.log('tmux not found — falling back to a detached background process');
  const out = openSync(join(LOGS, 'overnight.log'), 'a');
  const child = spawn(cmd, { shell: true, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  console.log(`pid ${child.pid}  —  tail -f ${join(LOGS, 'overnight.log')}`);
}

if (process.platform === 'darwin') {
  await sleep(2000);
  const assertions = (runCmd('pmset', ['-g', 'assertions']).stdout ?? '')
    .split('\n')
    .filter((line) => /PreventUserIdleSystemSleep|PreventSystemSleep/.test(line));
  console.log('\nsleep assertions now held:');
  console.log(assertions.map((line) => `  ${line.trim()}`).join('\n'));
}
