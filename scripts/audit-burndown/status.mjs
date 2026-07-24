// status.mjs — where does the burndown stand right now?

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chdirRoot, countEntries, gitOut, LOGS, runCmd, WORK } from './lib.mjs';

chdirRoot();

const countLines = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim()).length
    : 0;

const remaining = countEntries() ?? 0;
const done = countLines(join(WORK, 'completed.log'));
const deferredHeadings = existsSync('docs/AUDIT-DEFERRED.md')
  ? readFileSync('docs/AUDIT-DEFERRED.md', 'utf8')
      .split('\n')
      .filter((l) => /^### \[/.test(l))
  : [];
const total = done + deferredHeadings.length + remaining;

console.log(`branch     ${gitOut('rev-parse', '--abbrev-ref', 'HEAD')}`);
console.log(`completed  ${done}`);
console.log(`deferred   ${deferredHeadings.length}`);
console.log(`remaining  ${remaining} of ${total}`);

if (total > 0) {
  const pct = Math.floor(((done + deferredHeadings.length) * 100) / total);
  const bars = Math.floor(pct / 3);
  console.log(`progress   [${'#'.repeat(bars)}${'.'.repeat(33 - bars)}] ${pct}%`);
}

const pid = (runCmd('pgrep', ['-f', 'audit-burndown/burndown.mjs']).stdout ?? '').split('\n', 1)[0];
if (pid) console.log(`state      RUNNING (pid ${pid})`);
else if (existsSync(join(WORK, 'STOP'))) {
  console.log(`state      STOPPED (STOP file present — rm ${WORK}/STOP to resume)`);
} else console.log('state      idle');

const prNumberFile = join(WORK, 'pr-number');
if (existsSync(prNumberFile))
  console.log(`PR         #${readFileSync(prNumberFile, 'utf8').trim()}`);

console.log('\nlast 10 audit commits');
const commits = gitOut('log', '--oneline', '-10', '--grep=^Audit:');
if (commits) console.log(commits.replace(/^/gm, '  '));
else {
  console.log('  (none yet — showing branch head)');
  console.log(gitOut('log', '--oneline', '-3').replace(/^/gm, '  '));
}

const runLog = join(LOGS, 'run.log');
if (existsSync(runLog)) {
  console.log('\nlast 8 log lines');
  const lines = readFileSync(runLog, 'utf8').trim().split('\n').slice(-8);
  console.log(lines.map((l) => `  ${l}`).join('\n'));
}

if (deferredHeadings.length > 0) {
  console.log('\ndeferred findings');
  console.log(
    deferredHeadings
      .slice(-10)
      .map((l) => `  ${l.replace(/^### /, '')}`)
      .join('\n')
  );
}
