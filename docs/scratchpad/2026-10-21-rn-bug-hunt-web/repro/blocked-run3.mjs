import { spawn } from 'node:child_process';
import { appendFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const jobs = [
  ['chromium', 'ui', { HUNT_PROFILES: 'tablet,desktop', HUNT_CASES: 'X06-undo-shortcut' }],
  ['chromium', 'platform', { HUNT_PROFILES: 'phone', HUNT_CASES: 'D12-short-full-clear-drag' }],
  [
    'chromium',
    'ai',
    { HUNT_PROFILES: 'tablet,desktop', HUNT_CASES: 'A01-A03-A08-fixture-success' },
  ],
  ['chromium', 'blocked-zoom', {}],
  ['webkit', 'blocked-zoom', {}],
  ['firefox', 'drawing', { HUNT_PROFILES: 'phone,desktop', HUNT_CASES: 'D02-D05-brush-ink-undo' }],
  ['firefox', 'coloring-brushes', {}],
  ['firefox', 'blocked-zoom', {}],
];
const receipts = [];
for (const [engine, script, env] of jobs) {
  const log = `${out}/evidence/blocked-${engine}-${script}-run3.log.txt`,
    fd = openSync(log, 'w'),
    at = new Date().toISOString();
  appendFileSync(
    `${out}/status.md`,
    `\n- ${at} — RUN 3 BLOCKED TRIAGE START ${engine}/${script}. AI preparation-failure/PNG-reader issue reproductions excluded.\n`
  );
  const child = spawn(process.execPath, [`${out}/repro/${script}.mjs`], {
    env: { ...process.env, HUNT_ENGINE: engine, ...env },
    stdio: ['ignore', fd, fd],
  });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 600000);
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  clearTimeout(timeout);
  closeSync(fd);
  receipts.push({ engine, script, at, code, log });
  writeFileSync(
    `${out}/evidence/blocked-run3-batches.json`,
    JSON.stringify(receipts, null, 2) + '\n'
  );
  appendFileSync(
    `${out}/status.md`,
    `\n- ${new Date().toISOString()} — RUN 3 BLOCKED TRIAGE END ${engine}/${script}: process exit ${code}; case verdicts recorded separately.\n`
  );
  console.log(JSON.stringify(receipts.at(-1)));
}
