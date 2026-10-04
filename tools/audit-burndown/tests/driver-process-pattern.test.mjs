import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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

// The hard stop each source documents, verified on a stand-in tree launched the way
// launch-overnight launches the driver (PR body): it captures the descendants before the
// first signal, because a driver killed alone orphans its in-flight agent call.
const HARD_STOP = [
  `walk() { echo "$1"; for c in $(pgrep -P "$1"); do walk "$c"; done; }`,
  `d=$(pgrep -f '${DRIVER_PROCESS_PATTERN}') && kill -0 "$d" && walk "$d" | xargs kill -TERM`,
];

// The Claude skill quotes the unanchored wait loop on purpose, as the example that never exits.
const DOCUMENTED_ANTI_EXAMPLE = "until ! pgrep -f 'audit-burndown/run-burndown.mjs'";

const SHELL_WORD = /[ \t]+('[^']*'|"[^"]*"|[^\s'"`|;&<>()]+)/y;
// pgrep and pkill options whose next word is a value rather than the pattern.
const VALUE_OPTIONS = new Set(['-P', '-g', '-G', '-u', '-U', '-t', '-F', '-s', '-d']);
const PKILL_SIGNAL = /^-(?:\d+|(?:SIG)?[A-Z]{2,}\d*)$/;
const AGENT_RUNNER_NAME = /\b(?:claude|codex)\b/;

const unquote = (word) => word.replace(/^(['"])(.*)\1$/s, '$2');

// Every pgrep or pkill command in the text, including one nested in another's `-P "$(…)"`.
function processInvocations(text) {
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
    const command = `pkill -TERM -P "$(pgrep -f '${DRIVER_PROCESS_PATTERN}')" -f 'claude -p'`;
    expect(driverLookupPatterns(command)).toEqual([DRIVER_PROCESS_PATTERN]);
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
    [`pkill -TERM -P "$(pgrep -f '${DRIVER_PROCESS_PATTERN}')" -f 'claude -p|codex exec'`, true],
    [`pgrep -P "$d" -f 'codex exec'`, true],
  ])('reads %s as parent-scoped: %s', (command, scoped) => {
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
});
