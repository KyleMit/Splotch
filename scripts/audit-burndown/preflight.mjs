// preflight.mjs — check everything before an unattended burndown run.
// Read-only; run it before every launch (overnight.mjs runs it for you).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCommand } from '../lib/utils.mjs';
import {
  auditFile,
  chdirRoot,
  countEntries,
  getEntry,
  gitOk,
  gitOut,
  PROMPTS,
  runCmd,
} from './lib.mjs';

chdirRoot();

let failed = false;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  failed = true;
};
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

console.log('dependencies');
for (const bin of ['gh', 'claude', 'git', 'npm']) {
  if (!hasCommand(bin)) {
    bad(`${bin} not found`);
    continue;
  }
  const version = (runCmd(bin, ['--version']).stdout ?? '').split('\n', 1)[0];
  ok(`${bin} ${version}`);
}

console.log('auth');
if (runCmd('claude', ['auth', 'status']).status === 0) ok('claude logged in');
else bad('claude not logged in (run: claude auth login)');
if (runCmd('gh', ['auth', 'status']).status === 0) ok('gh logged in');
else bad('gh not logged in (run: gh auth login)');

console.log('repo');
if (gitOk('diff', '--quiet') && gitOk('diff', '--cached', '--quiet')) ok('working tree clean');
else bad('working tree is dirty');
ok(`branch: ${gitOut('rev-parse', '--abbrev-ref', 'HEAD')}`);
if (existsSync(auditFile())) ok(`${auditFile()} present`);
else bad(`${auditFile()} missing — nothing staged to burn down`);
if (/^\.audit-work/m.test(readFileSync('.gitignore', 'utf8'))) ok('.audit-work is gitignored');
else warn('.audit-work not in .gitignore');

console.log('prompts');
for (const prompt of ['verifier', 'implementer', 'reviewer']) {
  if (existsSync(join(PROMPTS, `${prompt}.md`))) ok(`prompt: ${prompt}`);
  else bad(`${join(PROMPTS, `${prompt}.md`)} missing`);
}

console.log('backlog');
const count = countEntries();
if (count === null) {
  bad(`could not parse ${auditFile()}`);
} else {
  ok(`${count} findings parsed`);
  if (count === 0) warn('backlog is empty');
  else console.log(`    first entry: ${getEntry().split('\n', 1)[0]}`);
}

console.log('build');
const checkCmd = process.env.CHECK_CMD ?? 'npm run check';
if (runCmd(checkCmd, [], { shell: true, stdio: 'ignore' }).status === 0) ok(`${checkCmd} passes`);
else bad(`${checkCmd} fails — fix before starting`);

console.log('power (macOS)');
if (process.platform === 'darwin') {
  const assertions = runCmd('pmset', ['-g', 'assertions']).stdout ?? '';
  if (/PreventUserIdleSystemSleep\s+1/.test(assertions)) ok('a sleep assertion is held');
  else warn('no sleep assertion — launch via npm run audit:burndown:overnight (caffeinate)');
  const sleepLine = (runCmd('pmset', ['-g']).stdout ?? '')
    .split('\n')
    .find((line) => /^ *sleep/.test(line));
  if (sleepLine) console.log(`    ${sleepLine.trim()}`);
} else {
  warn('not macOS — sleep checks skipped');
}

console.log();
if (failed) {
  console.log('PREFLIGHT FAILED');
  process.exit(1);
}
console.log('PREFLIGHT OK');
