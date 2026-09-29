import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRIVER_PROCESS_PATTERN } from '../lib/burndown-core.mjs';

const DRIVER_LOOKUP_SOURCES = [
  '.claude/hooks/precompact-burndown-snapshot.sh',
  '.claude/hooks/session-start-burndown-snapshot.sh',
  '.claude/skills/burn-down-audits/SKILL.md',
  '.agents/skills/burn-down-audits/SKILL.md',
];

// The Claude skill quotes the unanchored wait loop on purpose, as the example that never exits.
const DOCUMENTED_ANTI_EXAMPLE = "until ! pgrep -f 'audit-burndown/run-burndown.mjs'";

const PROCESS_MATCH_PATTERN =
  /(?:pgrep|pkill)(?:\s+-[a-zA-Z]+)+\s+(?:'([^']*)'|"([^"]*)"|([^\s`|>]+))/g;

function driverLookupPatterns(text) {
  return [...text.matchAll(PROCESS_MATCH_PATTERN)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((pattern) => pattern.includes('burndown'));
}

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
