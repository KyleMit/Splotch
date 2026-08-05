// status.mjs — where does the burndown stand right now?

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chdirRoot,
  countEntries,
  entryTitle,
  gitOut,
  isEntryStart,
  LOGS,
  runCmd,
  WORK,
} from './lib.mjs';

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
  ? readFileSync('docs/AUDIT-DEFERRED.md', 'utf8').split('\n').filter(isEntryStart)
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

// While a finding is in flight, report how long it — and the current agent call
// — have been running, so a supervising agent can gut-check the duration
// (thresholds + remediation live in the burn-down-audits skill). Facts only, no
// verdict. "In flight" means the newest `iter` line is more recent than the
// newest terminal marker (DONE/DEFERRED/INVALID); between findings, show nothing.
if (pid) {
  const runLogPath = join(LOGS, 'run.log');
  const logLines = existsSync(runLogPath)
    ? readFileSync(runLogPath, 'utf8').trim().split('\n')
    : [];
  const lastIndex = (re) => logLines.reduce((acc, l, i) => (re.test(l) ? i : acc), -1);
  const iterIdx = lastIndex(/\]\s+iter\d+\b/);
  const termIdx = lastIndex(/\]\s+(DONE|DEFERRED|INVALID:)/);
  if (iterIdx >= 0 && iterIdx > termIdx) {
    const stampSecs = (line) => {
      const m = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\]/);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
    };
    const now = new Date();
    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const since = (secs) => (secs == null ? null : (nowSecs - secs + 86400) % 86400);
    const fmt = (s) =>
      s >= 3600
        ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
        : s >= 60
          ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
          : `${s}s`;
    const findingSecs = since(stampSecs(logLines[iterIdx]));
    const title = logLines[iterIdx].replace(/^\[\d{2}:\d{2}:\d{2}\]\s+/, '');
    if (findingSecs != null) console.log(`in-flight  ${fmt(findingSecs)}  ${title}`);
    const launchFile = join(WORK, 'launch-command');
    const launch = existsSync(launchFile) ? readFileSync(launchFile, 'utf8') : '';
    const runner =
      process.env.AGENT_RUNNER === 'codex' || /AGENT_RUNNER='codex'/.test(launch)
        ? 'codex exec'
        : 'claude -p';
    const cpid = (runCmd('pgrep', ['-f', runner]).stdout ?? '').split('\n').filter(Boolean).pop();
    if (cpid) {
      const etime = (runCmd('ps', ['-o', 'etime=', '-p', cpid.trim()]).stdout ?? '').trim();
      if (etime) console.log(`           current ${runner} call ${etime} (pid ${cpid.trim()})`);
    }
  }
}

// Unposted per-commit comments are work the supervising agent still owes the PR,
// and nothing else surfaces them — the driver only ever appends to this file.
const store = process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');
if (existsSync(store)) {
  const pending = readFileSync(store, 'utf8').split('\n').filter(Boolean).length;
  if (pending) console.log(`comments   ${pending} unposted (${store})`);
}

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
      .map((l) => `  ${entryTitle(l)}`)
      .join('\n')
  );
}
