// check-preflight.mjs — check everything before an unattended burndown run.
// Read-only; run it before every launch (launch-overnight.mjs runs it for you).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCommand } from '../lib/proc.mjs';
import {
  agentAuthCommand,
  agentRunnerDefaults,
  normalizeAgentRunner,
} from './lib/agent-runner.mjs';
import {
  auditFile,
  chdirRoot,
  countEntries,
  getEntry,
  gitOk,
  gitOut,
  PROMPTS,
  runCmd,
  WORK,
} from './lib/burndown-core.mjs';

chdirRoot();

const RESUME = process.env.RESUME === '1' || process.env.RESUME === 'true';
const BRANCH = process.env.BRANCH ?? 'audit/burndown';
const AGENT_RUNNER = normalizeAgentRunner(process.env.AGENT_RUNNER);
const RUNNER_DEFAULTS = agentRunnerDefaults(AGENT_RUNNER);

let failed = false;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  failed = true;
};
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

// No `gh` here, by design — the driver never calls GitHub.
console.log('dependencies');
for (const bin of [RUNNER_DEFAULTS.binary, 'git', 'npm']) {
  if (!hasCommand(bin)) {
    bad(`${bin} not found`);
    continue;
  }
  const version = (runCmd(bin, ['--version']).stdout ?? '').split('\n', 1)[0];
  ok(`${bin} ${version}`);
}

console.log('auth');
const auth = agentAuthCommand(AGENT_RUNNER);
if (runCmd(auth.cmd, auth.args).status === 0) ok(`${AGENT_RUNNER} logged in`);
else bad(`${AGENT_RUNNER} not logged in (run: ${auth.login})`);

console.log('repo');
const hasUntracked = Boolean(gitOut('ls-files', '--others', '--exclude-standard'));
if (gitOk('diff', '--quiet') && gitOk('diff', '--cached', '--quiet') && !hasUntracked)
  ok('working tree clean');
else if (RESUME) warn('working tree is dirty — RESUME=1 will reset it to HEAD');
else bad('working tree is dirty');
ok(`runner: ${AGENT_RUNNER}`);
ok(`branch: ${gitOut('rev-parse', '--abbrev-ref', 'HEAD')}`);
if (existsSync(auditFile())) ok(`${auditFile()} present`);
else bad(`${auditFile()} missing — nothing staged to burn down`);
if (/^\.audit-work/m.test(readFileSync('.gitignore', 'utf8'))) ok('.audit-work is gitignored');
else warn('.audit-work not in .gitignore');

// Resumability: show the branch a run would latch onto, so a fresh session can
// confirm it's resuming the real run rather than forking a new one. The PR is
// not checked here because the driver neither creates nor reads one — opening it
// and draining the comment store is the supervising agent's job.
console.log('resume target');
const branchState = gitOk('rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`)
  ? 'local'
  : gitOk('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`)
    ? 'origin only (fresh container — will adopt from origin)'
    : 'none yet (first run — will create)';
ok(`branch ${BRANCH}: ${branchState}`);
// A push that cannot reach origin turns every commit into work that dies with the
// container, which is the one failure this setup cannot tolerate. Checked with a
// dry run so preflight stays read-only.
if (
  !gitOk('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/HEAD') &&
  !gitOk('ls-remote', '--exit-code', 'origin')
)
  bad('origin is unreachable — commits could not be pushed');
else ok('origin reachable');

const store = process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');
if (existsSync(store)) {
  const lines = readFileSync(store, 'utf8').split('\n').filter(Boolean).length;
  if (lines) warn(`${lines} unposted PR comment(s) in ${store} — post them before they age out`);
}

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

console.log();
if (failed) {
  console.log('PREFLIGHT FAILED');
  process.exit(1);
}
console.log('PREFLIGHT OK');
