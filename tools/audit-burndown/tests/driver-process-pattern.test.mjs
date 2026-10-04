import { execFile, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DRIVER_PROCESS_PATTERN } from '../lib/burndown-core.mjs';

const DRIVER_LOOKUP_SOURCES = [
  '.claude/hooks/precompact-burndown-snapshot.sh',
  '.claude/hooks/session-start-burndown-snapshot.sh',
  '.claude/skills/burn-down-audits/SKILL.md',
  '.agents/skills/burn-down-audits/SKILL.md',
  'tools/audit-burndown/run-burndown.mjs',
];

// Where the abort and hard-stop commands are documented.
const STOP_COMMAND_SOURCES = [
  'tools/audit-burndown/run-burndown.mjs',
  '.claude/skills/burn-down-audits/SKILL.md',
  '.agents/skills/burn-down-audits/SKILL.md',
];

// The driver header's abort and the hard stop every stop source documents; the stand-in suite
// below runs both. The hard stop freezes each process before listing its children, because a
// capture that lets the tree keep running misses every process the tree starts mid-walk.
const ABORT = `pkill -TERM -P "$(pgrep -f '${DRIVER_PROCESS_PATTERN}')" -f 'claude -p|codex exec'`;
const HARD_STOP = [
  `walk() { kill -STOP "$1" || return 0; echo "$1"; for c in $(pgrep -P "$1"); do walk "$c"; done; }`,
  `d=$(pgrep -f '${DRIVER_PROCESS_PATTERN}') && kill -0 "$d" && { t=$(walk "$d")`,
  `  echo "$t" | xargs kill -TERM; echo "$t" | xargs kill -CONT; sleep 1; ! ps -o pid=,command= -p "$(echo "$t" | paste -sd, -)"; }`,
];

// The Claude skill quotes the unanchored wait loop on purpose, as the example that never exits.
const DOCUMENTED_ANTI_EXAMPLE = "until ! pgrep -f 'audit-burndown/run-burndown.mjs'";

// A backslash-newline continues a shell command, and in a `//` comment the next line's marker too.
const LINE_CONTINUATION = /\\\r?\n[ \t]*(?:\/\/[ \t]*)?/g;
const SHELL_WORD = /[ \t]+('[^']*'|"[^"]*"|[^\s'"`|;&<>()]+)/y;
// pgrep and pkill options whose next word is a value rather than the pattern.
const VALUE_OPTIONS = new Set(['-P', '-g', '-G', '-u', '-U', '-t', '-F', '-s', '-d']);
const PKILL_SIGNAL = /^-(?:\d+|(?:SIG)?[A-Z]{2,}\d*)$/;
const AGENT_RUNNER_NAME = /\b(?:claude|codex)\b/;

const unquote = (word) => word.replace(/^(['"])(.*)\1$/s, '$2');

// Every pgrep or pkill command in the text, including one nested in another's `-P "$(…)"`.
function processInvocations(source) {
  const text = source.replace(LINE_CONTINUATION, ' ');
  return [...text.matchAll(/\b(pgrep|pkill)\b/g)].map((match) => {
    const words = [];
    SHELL_WORD.lastIndex = match.index + match[0].length;
    for (let word = SHELL_WORD.exec(text); word; word = SHELL_WORD.exec(text)) words.push(word[1]);
    const args = match[1] === 'pkill' && PKILL_SIGNAL.test(words[0] ?? '') ? words.slice(1) : words;
    const options = [];
    let i = 0;
    for (; i < args.length && args[i].startsWith('-'); i++) {
      options.push(args[i]);
      if (VALUE_OPTIONS.has(args[i])) i++;
    }
    const pattern = i < args.length ? unquote(args[i]) : null;
    return { command: [match[1], ...words].join(' '), options, pattern };
  });
}

function driverLookupPatterns(text) {
  return processInvocations(text)
    .map(({ pattern }) => pattern)
    .filter((pattern) => pattern?.includes('burndown'));
}

const agentCallLookups = (text) =>
  processInvocations(text).filter(({ pattern }) => AGENT_RUNNER_NAME.test(pattern ?? ''));

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('DRIVER_PROCESS_PATTERN', () => {
  const matches = (commandLine) => new RegExp(DRIVER_PROCESS_PATTERN).test(commandLine);

  it('matches the driver that launch-overnight execs', () => {
    expect(matches('node tools/audit-burndown/run-burndown.mjs')).toBe(true);
  });

  it('does not match a shell whose command line mentions the driver', () => {
    expect(matches(`bash -c until ! pgrep -f '${DRIVER_PROCESS_PATTERN}'; do sleep 15; done`)).toBe(
      false
    );
    expect(matches('sh -c env MAX_ISSUES=5 node tools/audit-burndown/run-burndown.mjs')).toBe(
      false
    );
  });

  it.each([
    "pgrep -f 'audit-burndown/run-burndown.mjs'",
    "pgrep -fl 'audit-burndown/run-burndown.mjs'",
    "pgrep -f -l 'audit-burndown/run-burndown.mjs'",
    'pgrep -lf "audit-burndown/run-burndown.mjs"',
    'pgrep -af run-burndown.mjs | grep -v bash',
    "pkill -TERM -f 'audit-burndown/run-burndown.mjs'",
  ])('extracts the lookup pattern from %s', (command) => {
    expect(driverLookupPatterns(command)).toEqual([
      command.includes('audit-burndown/') ? 'audit-burndown/run-burndown.mjs' : 'run-burndown.mjs',
    ]);
  });

  it('reads the driver lookup nested in a parent scope, not the scope as a pattern', () => {
    expect(driverLookupPatterns(ABORT)).toEqual([DRIVER_PROCESS_PATTERN]);
  });

  it.each(DRIVER_LOOKUP_SOURCES)('is the only driver lookup or kill pattern in %s', (path) => {
    const patterns = driverLookupPatterns(read(path).replace(DOCUMENTED_ANTI_EXAMPLE, ''));
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toEqual(patterns.map(() => DRIVER_PROCESS_PATTERN));
  });

  it('is what show-status passes to pgrep', () => {
    const source = read('tools/audit-burndown/show-status.mjs');
    expect(source).toContain("runCmd('pgrep', ['-f', DRIVER_PROCESS_PATTERN])");
    expect(source).not.toContain('run-burndown.mjs');
  });
});

describe('agent-call lookups', () => {
  it.each([
    ["pgrep -f 'claude -p'", false],
    ['pgrep -fl "codex exec"', false],
    ["pkill -TERM -f 'claude -p|codex exec'", false],
    ["pkill -TERM -f \\\n  'claude -p'", false],
    ["// pkill -TERM -f \\\n//   'codex exec'", false],
    [ABORT, true],
    [`pgrep -P "$d" -f 'codex exec'`, true],
  ])('reads %j as parent-scoped: %s', (command, scoped) => {
    expect(agentCallLookups(command).map(({ options }) => options.includes('-P'))).toEqual([
      scoped,
    ]);
  });

  it.each(STOP_COMMAND_SOURCES)('scopes every agent-call lookup in %s to a parent', (path) => {
    const lookups = agentCallLookups(read(path));
    expect(lookups.length).toBeGreaterThan(0);
    expect(lookups.filter(({ options }) => !options.includes('-P'))).toEqual([]);
  });

  it("times only the driver's own child in show-status", () => {
    const source = read('tools/audit-burndown/show-status.mjs');
    expect(source.match(/runCmd\('(?:pgrep|pkill)', \[[^\]]*\]\)/g)).toEqual([
      "runCmd('pgrep', ['-f', DRIVER_PROCESS_PATTERN])",
      "runCmd('pgrep', ['-P', pid, '-f', runner])",
    ]);
  });

  it.each(STOP_COMMAND_SOURCES)('documents the one hard stop in %s', (path) => {
    const source = read(path);
    for (const line of HARD_STOP) expect(source).toContain(line);
  });

  it('documents the abort the stand-in suite runs in the driver header', () => {
    expect(read('tools/audit-burndown/run-burndown.mjs')).toContain(ABORT);
  });
});

// Each stand-in step takes milliseconds on an idle host; the limits leave room for a loaded one.
const STAND_IN_STEP_TIMEOUT_MS = 10_000;
const STAND_IN_TEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 20;
// The churning agent starts a tool this often, far faster than one pgrep call returns.
const CHURN_INTERVAL_MS = 5;
const TOOLS_BEFORE_HARD_STOP = 10;

// Launched the way launch-overnight.mjs launches the driver: a detached shell execs
// `env … node <driver>`, and the launcher exits. The driver runs each agent call through
// spawnSync and retries it, as runAgentStep does. The agent starts each tool command in a session
// of its own, as the Claude Code Bash tool does, and with STAND_IN_CHURN_MS keeps starting them.
const STAND_IN_LAUNCHER = String.raw`import { spawn } from 'node:child_process';
spawn('env STAND_IN=1 node ' + process.argv[2], { shell: true, detached: true, stdio: 'ignore' }).unref();
`;
const STAND_IN_DRIVER = String.raw`import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.STAND_IN_LOG, 'driver ' + process.pid + '\n');
for (let attempt = 1; attempt <= 3; attempt++) spawnSync('claude', ['-p', 'attempt ' + attempt]);
`;
const STAND_IN_AGENT = String.raw`#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const record = (kind, pid) => appendFileSync(process.env.STAND_IN_LOG, kind + ' ' + pid + '\n');
const startTool = () => record('tool', spawn('sleep', ['300'], { detached: true, stdio: 'ignore' }).pid);
record('agent', process.pid);
startTool();
if (process.env.STAND_IN_CHURN_MS) setInterval(startTool, Number(process.env.STAND_IN_CHURN_MS));
setInterval(() => {}, 60000);
`;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitFor(predicate, what) {
  const deadline = Date.now() + STAND_IN_STEP_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`stand-in never reached: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function createStandIn() {
  const dir = mkdtempSync(join(tmpdir(), 'burndown-stop-'));
  // Unique per test, so neither command can match another test's tree or a real driver.
  const driver = `stand-in-${randomUUID()}/run-burndown.mjs`;
  const log = join(dir, 'tree.log');
  const unrelatedLog = join(dir, 'unrelated.log');
  mkdirSync(dirname(join(dir, driver)));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'launch.mjs'), STAND_IN_LAUNCHER);
  writeFileSync(join(dir, driver), STAND_IN_DRIVER);
  writeFileSync(join(dir, 'bin', 'claude'), STAND_IN_AGENT);
  chmodSync(join(dir, 'bin', 'claude'), 0o755);
  const env = {
    ...process.env,
    PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
    STAND_IN_LOG: log,
  };
  const records = (path = log) =>
    existsSync(path)
      ? readFileSync(path, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => ({ kind: line.split(' ')[0], pid: Number(line.split(' ')[1]) }))
      : [];
  const kindOf = (kind) => records().filter((record) => record.kind === kind);
  let unrelatedCall;
  return {
    records,
    kindOf,
    launch(extraEnv = {}) {
      spawnSync(process.execPath, ['launch.mjs', driver], {
        cwd: dir,
        env: { ...env, ...extraEnv },
      });
    },
    // Another session's agent call: it matches the runner pattern but is no child of the driver.
    async startUnrelatedCall() {
      const call = spawn(process.execPath, [join(dir, 'bin', 'claude'), '-p', 'another session'], {
        env: { ...env, STAND_IN_LOG: unrelatedLog },
        stdio: 'ignore',
      });
      unrelatedCall = call;
      await waitFor(() => records(unrelatedLog).length === 2, 'the unrelated call starting a tool');
      return records(unrelatedLog).map(({ pid }) => pid);
    },
    run: (command) =>
      new Promise((resolve) => {
        const standInCommand = command.replaceAll(DRIVER_PROCESS_PATTERN, `^node ${driver}`);
        execFile('sh', ['-c', standInCommand], { cwd: dir, env }, (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, stdout, stderr })
        );
      }),
    cleanup() {
      if (unrelatedCall?.exitCode === null) unrelatedCall.kill('SIGKILL');
      for (const kinds of [['driver', 'agent'], ['tool']]) {
        for (const { pid } of records().filter(({ kind }) => kinds.includes(kind))) {
          if (alive(pid)) process.kill(pid, 'SIGKILL');
        }
      }
      for (const { pid } of records(unrelatedLog)) if (alive(pid)) process.kill(pid, 'SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('the documented stop commands on a stand-in tree', () => {
  let standIn;
  afterEach(() => standIn?.cleanup());

  it(
    'hard stop ends the driver and every process under it, tools started mid-walk included',
    async () => {
      standIn = createStandIn();
      const unrelated = await standIn.startUnrelatedCall();
      standIn.launch({ STAND_IN_CHURN_MS: String(CHURN_INTERVAL_MS) });
      await waitFor(
        () => standIn.kindOf('tool').length >= TOOLS_BEFORE_HARD_STOP,
        'the agent starting tools'
      );

      expect(await standIn.run(HARD_STOP.join('\n'))).toEqual({
        status: 0,
        stdout: '',
        stderr: '',
      });
      expect(standIn.records().filter(({ pid }) => alive(pid))).toEqual([]);
      expect(unrelated.filter(alive)).toEqual(unrelated);
    },
    STAND_IN_TEST_TIMEOUT_MS
  );

  it(
    "abort ends only the driver's agent call, and the driver retries it",
    async () => {
      standIn = createStandIn();
      const unrelated = await standIn.startUnrelatedCall();
      standIn.launch();
      await waitFor(() => standIn.kindOf('agent').length === 1, 'the first agent call');
      const [{ pid: aborted }] = standIn.kindOf('agent');

      expect((await standIn.run(ABORT)).status).toBe(0);
      await waitFor(() => standIn.kindOf('agent').length === 2, 'the driver retrying the call');
      expect(alive(aborted)).toBe(false);
      expect(standIn.kindOf('driver').map(({ pid }) => alive(pid))).toEqual([true]);
      expect(unrelated.filter(alive)).toEqual(unrelated);
    },
    STAND_IN_TEST_TIMEOUT_MS
  );

  it(
    'signals nothing unless exactly one driver matches',
    async () => {
      standIn = createStandIn();
      const unrelated = await standIn.startUnrelatedCall();
      expect((await standIn.run(HARD_STOP.join('\n'))).status).not.toBe(0);
      expect((await standIn.run(ABORT)).status).not.toBe(0);

      standIn.launch();
      standIn.launch();
      await waitFor(() => standIn.kindOf('tool').length === 2, 'two drivers each starting a call');
      expect((await standIn.run(HARD_STOP.join('\n'))).status).not.toBe(0);
      expect((await standIn.run(ABORT)).status).not.toBe(0);
      expect(standIn.records().filter(({ pid }) => !alive(pid))).toEqual([]);
      expect(unrelated.filter(alive)).toEqual(unrelated);
    },
    STAND_IN_TEST_TIMEOUT_MS
  );
});
