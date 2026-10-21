import { spawn } from 'node:child_process';
import { openSync, closeSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const jobs = [];
for (const engine of (
  process.env.HUNT_ENGINES ??
  process.env.HUNT_ENGINE ??
  'webkit,firefox'
).split(',')) {
  for (const script of process.env.HUNT_SCRIPTS?.split(',') ?? [
    'input',
    'drawing',
    'ui',
    'settings-actions',
    'platform',
    'ai',
    'gate-lockout',
    'offline-install-storage',
    'update',
    'back',
  ]) {
    jobs.push({
      engine,
      script,
      env: script === 'update' ? { HUNT_BASE: 'http://127.0.0.1:6152' } : {},
    });
  }
}
const results = [];
const MAX_BATCH_MS = 600000;
let active = null;
const heartbeat = setInterval(
  () =>
    appendFileSync(
      `${out}/status.md`,
      `\n- ${new Date().toISOString()} — HEARTBEAT: sequential browser campaign active at ${active?.engine}/${active?.script}; ${results.length}/${jobs.length} script batches ended.\n`
    ),
  25 * 60 * 1000
);
try {
  for (const job of jobs) {
    active = job;
    appendFileSync(
      `${out}/status.md`,
      `\n- ${new Date().toISOString()} — START ${job.engine}/${job.script}; one remote browser connection at a time.\n`
    );
    const log = `${out}/evidence/${job.engine}-${job.script}-batch.log.txt`;
    const fd = openSync(log, 'w');
    const started = Date.now();
    const child = spawn(process.execPath, [`${out}/repro/${job.script}.mjs`], {
      cwd: process.cwd(),
      env: { ...process.env, HUNT_ENGINE: job.engine, ...job.env },
      stdio: ['ignore', fd, fd],
    });
    const deadline = setTimeout(() => {
      appendFileSync(
        `${out}/status.md`,
        `\n- ${new Date().toISOString()} — TIMEOUT ${job.engine}/${job.script}; terminating owned child ${child.pid} after the protocol's 600s batch limit.\n`
      );
      child.kill('SIGTERM');
    }, MAX_BATCH_MS);
    writeFileSync(
      `${out}/evidence/active-batch.json`,
      JSON.stringify(
        { ...job, pid: child.pid, startedAt: new Date(started).toISOString(), log },
        null,
        2
      ) + '\n'
    );
    const code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('exit', done);
    });
    clearTimeout(deadline);
    closeSync(fd);
    const row = { ...job, code, ms: Date.now() - started, log };
    results.push(row);
    writeFileSync(
      `${out}/evidence/${process.env.HUNT_RECEIPT ?? 'engine-batches'}.json`,
      JSON.stringify(results, null, 2) + '\n'
    );
    appendFileSync(
      `${out}/status.md`,
      `\n- ${new Date().toISOString()} — END ${job.engine}/${job.script}: process exit ${code}, ${Math.round(row.ms / 1000)}s. Product outcomes are the per-case observations, not this process exit.\n`
    );
    console.log(JSON.stringify(row));
  }
} finally {
  clearInterval(heartbeat);
  active = null;
  writeFileSync(
    `${out}/evidence/active-batch.json`,
    JSON.stringify({ finishedAt: new Date().toISOString(), batches: results.length }, null, 2) +
      '\n'
  );
}
