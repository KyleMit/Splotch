import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, closeSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as prettier from 'prettier';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const batches = JSON.parse(readFileSync(`${out}/evidence/visual-run3-batches.json`));
assert.deepEqual(
  batches.map((r) => r.engine),
  ['chromium', 'webkit', 'firefox']
);
assert(
  batches.every((r) => r.code === 0),
  'Wait for every browser capture to end before SvelteKit sync'
);
const cache = mkdtempSync('/private/tmp/splotch-web-run3-dprint-');
const jobs = [
  ['format-code', 'node', [`${out}/repro/format-evidence.mjs`]],
  ['format-markdown', 'node_modules/.bin/dprint', ['fmt', `${out}/**/*.md`]],
  [
    'pointer-positive-final',
    'npm',
    ['run', 'test:tools', '--', 'tests/native-paper-input-web.test.mjs'],
  ],
  ['pointer-negative-final', 'node', [`${out}/repro/pointer-negative-controls.mjs`]],
  ['check-final', 'npm', ['run', 'check']],
  ['lint-final', 'npm', ['run', 'lint']],
  ['format-full-final', 'npm', ['run', 'format:check']],
];
const results = [];
for (const [name, command, args] of jobs) {
  const log = `${out}/evidence/${name}-run3.log.txt`,
    fd = openSync(log, 'w'),
    start = Date.now();
  const result = spawnSync(command, args, {
    env: { ...process.env, DPRINT_CACHE_DIR: cache },
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
  results.push(row);
  writeFileSync(
    `${out}/evidence/final-checks-run3.json`,
    await prettier.format(
      JSON.stringify({ at: new Date().toISOString(), dprintCache: cache, results }),
      {
        ...(await prettier.resolveConfig(`${out}/evidence/final-checks-run3.json`)),
        filepath: `${out}/evidence/final-checks-run3.json`,
      }
    )
  );
  console.log(JSON.stringify(row));
}
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
