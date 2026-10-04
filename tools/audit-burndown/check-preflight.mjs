// check-preflight.mjs — check everything before an unattended burndown run.
// Read-only; run it before every launch (launch-overnight.mjs runs it for you).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCommand, isMain, parseOrFail } from '../lib/proc.mjs';
import { agentAuthCommand } from './lib/agent-runner.mjs';
import { readConfig } from './lib/burndown-config.mjs';
import {
  chdirRoot,
  commandFailureOutput,
  countEntries,
  getEntry,
  git,
  PROMPTS,
  runCmd,
  shellOk,
} from './lib/burndown-core.mjs';

// How much of a failed origin probe's output the report keeps, counted from the end. git fails
// these probes in a few short lines, so the cap only bounds a pathological transcript.
const PROBE_FAILURE_OUTPUT_CHARS = 600;

function indentedFailureOutput(result) {
  return commandFailureOutput(result, PROBE_FAILURE_OUTPUT_CHARS)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `      ${line}`)
    .join('\n');
}

// A run's only durable output is what reaches origin: the container holding its unpushed commits
// can be reclaimed at any time. So every preflight asks origin itself. `ls-remote` proves origin
// answers. A dry-run push to the run's branch proves origin opens its push service to this
// checkout, whose push URL and credentials can differ from its fetch side's. A dry run sends no
// ref update, so it creates nothing, and so it cannot see a rule origin applies to an update, such
// as branch protection. The run fetches and fast-forwards before it pushes, so git's client-side
// fast-forward check would only compare tips this probe does not ask about: the push side can hold
// another tip than the listing showed, or the branch can move in between. `--force` skips that
// check. The source is origin's own tip of the branch when it has one, which keeps the usual case
// a no-op even if `--dry-run` were ever dropped; otherwise it is HEAD.
function probeOriginPush(git, branch) {
  const listing = git('ls-remote', 'origin');
  if (listing.status !== 0) {
    return {
      passed: false,
      message: `origin unreachable — git ls-remote origin exited ${listing.status}\n${indentedFailureOutput(listing)}`,
    };
  }
  const ref = `refs/heads/${branch}`;
  const tip = listing.stdout
    .split('\n')
    .find((line) => line.endsWith(`\t${ref}`))
    ?.split('\t', 1)[0];
  const refspec = `${tip ?? 'HEAD'}:${ref}`;
  const push = git('push', '--dry-run', '--force', 'origin', refspec);
  if (push.status !== 0) {
    return {
      passed: false,
      message: `origin refuses a push to ${branch} — git push --dry-run --force origin ${refspec} exited ${push.status}\n${indentedFailureOutput(push)}`,
    };
  }
  return { passed: true, message: `origin accepts a dry-run push to ${branch}` };
}

// Runs every check, printing each verdict as it lands, and returns whether none failed. Paths
// resolve against the working directory, which main() sets to the repo root. `effects` is every
// probe of the world beyond those files — git, the shell gate, the runner binary, its auth, and
// the log — so a test can drive the checks against a temporary clone.
export function checkPreflight({ config, effects }) {
  const { AGENT_RUNNER, AUDIT_FILE, BRANCH, CHECK_CMD, COMMENT_STORE, RESUME, RUNNER_DEFAULTS } =
    config;
  const { git, hasCommand, log, runCmd, shellOk } = effects;
  const gitOk = (...args) => git(...args).status === 0;
  const gitOut = (...args) => (git(...args).stdout ?? '').trim();

  let failed = false;
  const ok = (msg) => log(`  \x1b[32m✓\x1b[0m ${msg}`);
  const bad = (msg) => {
    log(`  \x1b[31m✗\x1b[0m ${msg}`);
    failed = true;
  };
  const warn = (msg) => log(`  \x1b[33m!\x1b[0m ${msg}`);

  // No `gh` here, by design — the driver never calls GitHub.
  log('dependencies');
  for (const bin of [RUNNER_DEFAULTS.binary, 'git', 'npm']) {
    if (!hasCommand(bin)) {
      bad(`${bin} not found`);
      continue;
    }
    const version = (runCmd(bin, ['--version']).stdout ?? '').split('\n', 1)[0];
    ok(`${bin} ${version}`);
  }

  log('auth');
  const auth = agentAuthCommand(AGENT_RUNNER);
  if (runCmd(auth.cmd, auth.args).status === 0) ok(`${AGENT_RUNNER} logged in`);
  else bad(`${AGENT_RUNNER} not logged in (run: ${auth.login})`);

  log('repo');
  const hasUntracked = Boolean(gitOut('ls-files', '--others', '--exclude-standard'));
  if (gitOk('diff', '--quiet') && gitOk('diff', '--cached', '--quiet') && !hasUntracked)
    ok('working tree clean');
  else if (RESUME) warn('working tree is dirty — RESUME=1 will reset it to HEAD');
  else bad('working tree is dirty');
  ok(`runner: ${AGENT_RUNNER}`);
  ok(`branch: ${gitOut('rev-parse', '--abbrev-ref', 'HEAD')}`);
  if (existsSync(AUDIT_FILE)) ok(`${AUDIT_FILE} present`);
  else bad(`${AUDIT_FILE} missing — nothing staged to burn down`);
  if (/^\.audit-work/m.test(readFileSync('.gitignore', 'utf8'))) ok('.audit-work is gitignored');
  else warn('.audit-work not in .gitignore');

  // Resumability: show the branch a run would latch onto, so a fresh session can
  // confirm it's resuming the real run rather than forking a new one. The PR is
  // not checked here because the driver neither creates nor reads one — opening it
  // and draining the comment store is the supervising agent's job.
  log('resume target');
  const branchState = gitOk('rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`)
    ? 'local'
    : gitOk('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`)
      ? 'origin only (fresh container — will adopt from origin)'
      : 'none yet (first run — will create)';
  ok(`branch ${BRANCH}: ${branchState}`);
  const origin = probeOriginPush(git, BRANCH);
  if (origin.passed) ok(origin.message);
  else bad(origin.message);

  if (existsSync(COMMENT_STORE)) {
    const lines = readFileSync(COMMENT_STORE, 'utf8').split('\n').filter(Boolean).length;
    if (lines)
      warn(`${lines} unposted PR comment(s) in ${COMMENT_STORE} — post them before they age out`);
  }

  log('prompts');
  for (const prompt of ['verifier', 'implementer', 'reviewer']) {
    if (existsSync(join(PROMPTS, `${prompt}.md`))) ok(`prompt: ${prompt}`);
    else bad(`${join(PROMPTS, `${prompt}.md`)} missing`);
  }

  log('backlog');
  const count = countEntries(AUDIT_FILE);
  if (count === null) {
    bad(`could not parse ${AUDIT_FILE}`);
  } else {
    ok(`${count} findings parsed`);
    if (count === 0) warn('backlog is empty');
    else log(`    first entry: ${getEntry(1, AUDIT_FILE).split('\n', 1)[0]}`);
  }

  log('build');
  if (shellOk(CHECK_CMD)) ok(`${CHECK_CMD} passes`);
  else bad(`${CHECK_CMD} fails — fix before starting`);

  return !failed;
}

// The driver's own knob parser: a value the run would refuse stops the launch here, before any
// check prints.
function main() {
  const config = parseOrFail(() => readConfig(process.env));
  chdirRoot();
  const passed = checkPreflight({
    config,
    effects: { git, hasCommand, log: console.log, runCmd, shellOk },
  });
  console.log();
  if (!passed) {
    console.log('PREFLIGHT FAILED');
    process.exit(1);
  }
  console.log('PREFLIGHT OK');
}

if (isMain(import.meta.url)) main();
