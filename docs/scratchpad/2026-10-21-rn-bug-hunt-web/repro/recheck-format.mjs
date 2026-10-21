import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as prettier from 'prettier';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const path = `${out}/evidence/final-checks-run3.json`;
const receipt = JSON.parse(readFileSync(path));
const jobs = [
  ['format-code-refresh', 'node', [`${out}/repro/format-evidence.mjs`]],
  ['format-markdown-refresh', 'node_modules/.bin/dprint', ['fmt', `${out}/**/*.md`]],
  ['format-full-recheck', 'npm', ['run', 'format:check']],
];
for (const [name, command, args] of jobs) {
  assert(!receipt.results.some((r) => r.name === name), 'Preserve prior recheck attempts');
  const log = `${out}/evidence/${name}-run3.log.txt`;
  const fd = openSync(log, 'w'),
    start = Date.now();
  const result = spawnSync(command, args, {
    env: { ...process.env, DPRINT_CACHE_DIR: receipt.dprintCache },
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  const row = {
    name,
    command: [command, ...args],
    exitCode: result.status,
    signal: result.signal,
    ms: Date.now() - start,
    log,
  };
  receipt.at = new Date().toISOString();
  receipt.results.push(row);
  writeFileSync(
    path,
    await prettier.format(JSON.stringify(receipt), {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    })
  );
  console.log(JSON.stringify(row));
  if (result.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
