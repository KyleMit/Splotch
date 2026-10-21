import { spawn } from 'node:child_process';
import { appendFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web',
  receipts = [];
for (const engine of ['chromium', 'webkit', 'firefox']) {
  const log = `${out}/evidence/visual-${engine}-run3.log.txt`,
    fd = openSync(log, 'a'),
    at = new Date().toISOString();
  const child = spawn(process.execPath, [`${out}/repro/visual-parity.mjs`], {
    env: { ...process.env, HUNT_ENGINE: engine, HUNT_RETAKE: process.env.HUNT_RETAKE ?? '' },
    stdio: ['ignore', fd, fd],
  });
  appendFileSync(
    `${out}/status.md`,
    `\n- ${at} — VISUAL MATRIX START ${engine}, owned child ${child.pid}. Sequential engine/arm contexts, DPR 1, all requested configurations.\n`
  );
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  closeSync(fd);
  receipts.push({ engine, at, finishedAt: new Date().toISOString(), code, log });
  writeFileSync(
    `${out}/evidence/visual-run3-batches.json`,
    JSON.stringify(receipts, null, 2) + '\n'
  );
  console.log(JSON.stringify(receipts.at(-1)));
  if (code !== 0) break;
}
