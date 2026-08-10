// overnight.mjs — launch an unattended burndown that outlives the shell that
// started it.
//
//   npm run audit:burndown:overnight -- 600
//
// The job is spawned detached, in its own process group, with stdio pointed at
// .audit-work/logs/overnight.log, so closing the terminal — or the supervising
// agent's Bash call returning — cannot SIGHUP it.
//
// There is no sleep assertion and no tmux here. This runs in a cloud container
// that does not sleep, and what actually ends a run early is the container being
// reclaimed for inactivity, which no local wakelock addresses. What protects the
// work is pushing every finding (PUSH_EVERY in burndown.mjs), not keeping this
// process alive.

import { spawn, spawnSync } from 'node:child_process';
import { openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chdirRoot, ensureWorkDirs, LAUNCH_KNOBS, LOGS, shellQuote, WORK } from './lib.mjs';

const count = process.argv[2] ?? '600';
if (!/^\d+$/.test(count) || Number(count) < 1) {
  console.error(
    `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`
  );
  process.exit(2);
}

chdirRoot();
ensureWorkDirs();

// An unattended launch is resume-capable by design: default RESUME=1 so a relaunch
// after a crash recovers a dirty tree / stale STOP instead of halting (a first,
// clean launch has nothing to recover, so it's a no-op). Set before the preflight
// spawn — which inherits this env — so preflight warns rather than fails on crash
// residue. An operator can still force RESUME=0 to keep the strict dirty-tree halt.
process.env.RESUME = process.env.RESUME ?? '1';

const preflight = spawnSync(process.execPath, ['tools/audit-burndown/preflight.mjs'], {
  stdio: 'inherit',
});
if (preflight.status !== 0) {
  console.error('preflight failed — not launching');
  process.exit(1);
}

rmSync(join(WORK, 'STOP'), { force: true });

// Forward the burndown's env knobs into the job command itself, not just this
// process's env: the job goes through a shell, and baking the assignments in
// keeps an override working regardless of how the child's environment is set up.
// The list lives in lib.mjs because burndown.mjs needs the same one.
const forwarded = LAUNCH_KNOBS.filter((knob) => process.env[knob] != null).map(
  (knob) => `${knob}=${shellQuote(process.env[knob])}`
);

const envPrefix = [`MAX_ISSUES=${shellQuote(count)}`, ...forwarded].join(' ');
const cmd = `env ${envPrefix} node tools/audit-burndown/burndown.mjs`;

const out = openSync(join(LOGS, 'overnight.log'), 'a');
const child = spawn(cmd, { shell: true, detached: true, stdio: ['ignore', out, out] });
child.unref();

console.log(`launched detached — pid ${child.pid}`);
console.log(`  log:     tail -f ${join(LOGS, 'run.log')}`);
console.log('  status:  npm run audit:status');
console.log('  cost:    npm run audit:cost');
console.log(`  stop:    touch ${join(WORK, 'STOP')}`);
