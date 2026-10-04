// The harness every suite that drives createBurndownRun shares: a temp backlog to run against,
// the agent envelopes a scripted role returns, and createRun, which builds a run whose effects
// bundle (git, shell, agent runner, log, halt) is replaced by recorders. The run is driven for
// real, so what a suite observes is the ordering of the driver's own steps.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { readConfig } from '../../lib/burndown-config.mjs';
import { createBurndownRun } from '../../run-burndown.mjs';

export const AUDIT_PATH = join('docs', 'AUDIT.md');
const BRIEF_PATH = join('.audit-work', 'current-brief.md');
export const COMPLETED_LOG = join('.audit-work', 'completed.log');
export const COMMENT_STORE = join('.audit-work', 'pending-comments.jsonl');
export const LAUNCH_COMMAND_PATH = join('.audit-work', 'launch-command');
export const LAUNCH_PID_PATH = join('.audit-work', 'launch-pid');
export const DEFERRED_PATH = join('docs', 'AUDIT-DEFERRED.md');

export const FIRST_TITLE = '[P1][complexity] First finding';
export const SECOND_TITLE = '[P2][dead-code] Second finding';
const THIRD_TITLE = '[P3][readability] Third finding';
export const entry = (title, body) => [`### ${title}`, '', '#### Problem', '', body, '', '---', ''];
const FIXTURE = [
  '# Audit',
  '',
  '## Source: Code audit — Area one',
  '',
  ...entry(FIRST_TITLE, 'The first thing is wrong.'),
  ...entry(SECOND_TITLE, 'The second thing is wrong.'),
].join('\n');
// A run needs three outcomes to show a counter being *reset* rather than merely
// not incremented, so the deferral-streak tests stage one more finding.
export const THREE_FINDING_FIXTURE = [
  FIXTURE,
  ...entry(THIRD_TITLE, 'The third thing is wrong.'),
].join('\n');

// A finished agent envelope, in the shape agent-runner.mjs normalizes to.
export const verifiedValid = (api, e2eSpecs = []) => {
  api.writeBrief();
  return {
    ok: true,
    structured: { verdict: 'VALID', reason: '', brief_path: BRIEF_PATH, e2e_specs: e2eSpecs },
  };
};
export const invalidVerdict = (reason = 'already fixed') => ({
  ok: true,
  structured: { verdict: 'INVALID', reason, brief_path: '', e2e_specs: [] },
});
export const implemented = (api, summary = 'made the change') => ({
  ok: true,
  sessionId: 'impl-session',
  structured: { success: true, sha: api.commit(), summary },
});
export const approved = { ok: true, structured: { status: 'APPROVED', findings: [] } };

// Gives one test a fresh backlog: a temp directory holding docs/AUDIT.md and .audit-work/, made
// the working directory because the driver addresses both by relative path. Pass it straight to
// beforeEach; the function it returns is Vitest's teardown, which puts everything back.
export function enterTempBacklog() {
  const originalCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'audit-run-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, '.audit-work'));
  writeFileSync(join(root, AUDIT_PATH), FIXTURE);
  process.chdir(root);
  vi.stubEnv('AUDIT_FILE', AUDIT_PATH);
  return () => {
    vi.unstubAllEnvs();
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  };
}

// Drives one run against the temp backlog. `respond` stands in for every agent call,
// `shellResult` for the deterministic gates, `shellOk` for the tree-is-green checks, `gitOk` for
// the git commands whose exit status the driver branches on (the push above all), `git` and
// `runCmd` for the commands whose full result it reads (an override returning nothing keeps the
// default success), and `hasCommand` for preflight's runner-binary probe. Every observable the
// driver emits in order — its log lines and its pushes — lands in one `events` array, because
// what distinguishes a push at the cadence from the exit flush is *when* it happens, not what it
// looks like.
export function createRun({
  env = {},
  respond,
  shellResult,
  shellOk,
  gitOk,
  git,
  runCmd,
  hasCommand,
} = {}) {
  const config = readConfig({ BUNDLE_SPEC: '', ...env });
  const events = [];
  const gitCalls = [];
  const agentCalls = [];
  const runCmdCalls = [];
  const shellCommands = [];
  const probedBinaries = [];
  let head = 1;

  const sha = () => String(head).padStart(40, '0');
  const api = {
    sha,
    commit: () => {
      head += 1;
      return sha();
    },
    writeBrief: () => {
      writeFileSync(BRIEF_PATH, '#### Acceptance criteria\n\n- the finding is fixed\n');
      // The brief must be newer than the issue file or briefIsStale rejects it,
      // and both writes can land in the same millisecond.
      const future = Date.now() / 1000 + 5;
      utimesSync(BRIEF_PATH, future, future);
    },
  };

  const effects = {
    logLine: (message) => events.push(message),
    halt: (message) => {
      events.push(`HALT: ${message}`);
      throw new Error(`HALT: ${message}`);
    },
    git: (...args) => {
      gitCalls.push(args);
      const result = git?.(...args) ?? { status: 0, stdout: '', stderr: '' };
      // Only a commit git accepted moves HEAD, so a record written after a refused one names the
      // previous commit, exactly as it would in a real repository.
      if (args[0] === 'commit' && result.status === 0) api.commit();
      return result;
    },
    gitOk: (...args) => {
      gitCalls.push(args);
      const ok = gitOk?.(...args) ?? true;
      // A push the remote rejected is not a push, so only a landed one joins the
      // event stream the cadence assertions read.
      if (args[0] === 'push' && ok) events.push('PUSH');
      return ok;
    },
    gitOut: (...args) => {
      gitCalls.push(args);
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return sha();
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return config.BRANCH;
      if (args[0] === 'rev-list') return '0';
      return '';
    },
    runCmd: (cmd, args) => {
      runCmdCalls.push([cmd, ...args]);
      return runCmd?.(cmd, args) ?? { status: 0, stdout: '', stderr: '' };
    },
    hasCommand: (binary) => {
      probedBinaries.push(binary);
      return hasCommand?.(binary) ?? true;
    },
    shellOk: (command) => {
      shellCommands.push(command);
      return shellOk?.(command) ?? true;
    },
    shellResult: (command) => {
      shellCommands.push(command);
      return shellResult?.(command) ?? { status: 0, stdout: '', stderr: '' };
    },
    agentStep: async (options) => {
      agentCalls.push(options);
      return respond(options, api);
    },
  };

  return {
    events,
    gitCalls,
    agentCalls,
    runCmdCalls,
    shellCommands,
    probedBinaries,
    api,
    run: createBurndownRun({ config, effects }),
  };
}

export const audit = () => readFileSync(AUDIT_PATH, 'utf8');
export const eventAt = (events, fragment) => events.findIndex((event) => event.includes(fragment));

// finish() reports a failed final push through process.exitCode, and the driver
// runs inside vitest's own process — so the run's code is read and then put back.
export const exitCodeOf = async (run) => {
  const before = process.exitCode;
  process.exitCode = 0;
  try {
    await run.execute();
    return process.exitCode;
  } finally {
    process.exitCode = before;
  }
};
