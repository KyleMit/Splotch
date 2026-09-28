import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const HOOK_CONFIGS = ['.claude/settings.json', '.codex/hooks.json'];
const SNAPSHOT_HOOK = join('.claude', 'hooks', 'session-start-burndown-snapshot.sh');
const HOOK_TIMEOUT_MS = 10_000;
const STALE_SNAPSHOT_AGE_SECONDS = 2 * 24 * 60 * 60;
const NUDGE =
  /^An audit burndown left a state snapshot from \d{4}-\d{2}-\d{2} \d{2}:\d{2} at `\.audit-work\/compact-snapshot\.md`\./;

// Each shim answers both probes the way that platform's stat does: GNU reads BSD's `-f %m FILE` as
// a file-system query and prints its report to stdout before failing; BSD rejects `-c` on stderr.
const STAT_SHIMS = {
  host: null,
  gnu: `case "$1" in
  -c) date -r "$3" +%s ;;
  *) printf '  File: "%s"\\n    ID: 1234 Namelen: 255 Type: ext2/ext3\\n' "$3"; exit 1 ;;
esac`,
  bsd: `case "$1" in
  -f) date -r "$3" +%s ;;
  *) echo "stat: illegal option -- c" >&2; exit 1 ;;
esac`,
};

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function readConfig(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function hookCommands(config) {
  return Object.values(config.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command))
  );
}

function closingParen(command, from) {
  let depth = 1;
  for (let i = from; i < command.length; i++) {
    if (command[i] === '(') depth++;
    else if (command[i] === ')' && --depth === 0) return i;
  }
  return command.length;
}

// A command substitution opens a fresh quoting context, so its body is scanned on its own: the
// quotes around "$(dirname $DIR)" do not protect the $DIR inside it.
function unquotedExpansions(command) {
  const found = [];
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote === "'") {
      if (char === "'") quote = null;
    } else if (char === '\\') {
      i++;
    } else if (command.startsWith('$(', i)) {
      const end = closingParen(command, i + 2);
      if (!quote) found.push(command.slice(i, end + 1));
      found.push(...unquotedExpansions(command.slice(i + 2, end)));
      i = end;
    } else if (char === '"') {
      quote = quote ? null : '"';
    } else if (char === "'" && !quote) {
      quote = "'";
    } else if (char === '$' && !quote) {
      found.push(/^\$(\{[^}]*\}|\w+)/.exec(command.slice(i))?.[0] ?? '$');
    }
  }
  return found;
}

function writeExecutable(path, body) {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function runSnapshotHook({ stat, snapshotAgeSeconds = 0, driverRunning = false }) {
  const root = mkdtempSync(join(tmpdir(), 'splotch agent hooks '));
  roots.push(root);
  const hookPath = join(root, SNAPSHOT_HOOK);
  mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
  copyFileSync(join(repoRoot, SNAPSHOT_HOOK), hookPath);
  chmodSync(hookPath, 0o755);

  const snapshot = join(root, '.audit-work', 'compact-snapshot.md');
  mkdirSync(join(root, '.audit-work'));
  writeFileSync(snapshot, '# Burndown state at compaction\n');
  const writtenAt = Date.now() / 1000 - snapshotAgeSeconds;
  utimesSync(snapshot, writtenAt, writtenAt);

  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeExecutable(join(bin, 'pgrep'), driverRunning ? 'echo 4242' : 'exit 1');
  if (STAT_SHIMS[stat]) writeExecutable(join(bin, 'stat'), STAT_SHIMS[stat]);

  const command = readConfig('.claude/settings.json').hooks.SessionStart.find(
    ({ matcher }) => matcher === 'compact'
  ).hooks[0].command;
  const { status, stderr, stdout } = spawnSync('/bin/sh', ['-c', command], {
    encoding: 'utf8',
    timeout: HOOK_TIMEOUT_MS,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: root,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    },
  });
  return { exit: { status, stderr }, stdout };
}

const CLEAN_EXIT = { status: 0, stderr: '' };

describe('agent hook commands', () => {
  it.each(HOOK_CONFIGS)('%s double-quotes every expansion in its hook commands', (path) => {
    const commands = hookCommands(readConfig(path));

    expect(commands.length).toBeGreaterThan(0);
    expect(
      commands.flatMap((command) =>
        unquotedExpansions(command).map((found) => `${found} in ${command}`)
      )
    ).toEqual([]);
  });

  it('flags an expansion the shell would word-split on a path containing a space', () => {
    expect(unquotedExpansions('$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh')).toEqual([
      '$CLAUDE_PROJECT_DIR',
    ]);
    expect(unquotedExpansions('node $(git rev-parse --show-toplevel)/x.mjs')).toEqual([
      '$(git rev-parse --show-toplevel)',
    ]);
    expect(unquotedExpansions('node "$(dirname $CLAUDE_PROJECT_DIR)/tools/x.mjs"')).toEqual([
      '$CLAUDE_PROJECT_DIR',
    ]);
    expect(unquotedExpansions('node "$(dirname "$CLAUDE_PROJECT_DIR")/tools/x.mjs"')).toEqual([]);
    expect(unquotedExpansions('"$CLAUDE_PROJECT_DIR"/.claude/hooks/x.sh')).toEqual([]);
    expect(unquotedExpansions('node "$CLAUDE_PROJECT_DIR/x.mjs" --runner=claude')).toEqual([]);
    expect(unquotedExpansions(`echo '$HOME' \\$HOME`)).toEqual([]);
  });
});

describe.each(Object.keys(STAT_SHIMS))('post-compaction burndown nudge with %s stat', (stat) => {
  it('points at a fresh snapshot from a checkout path containing a space', () => {
    const result = runSnapshotHook({ stat });

    expect(result.exit).toEqual(CLEAN_EXIT);
    expect(result.stdout).toMatch(NUDGE);
  });

  it('stays silent about a day-old snapshot when no driver is running', () => {
    const result = runSnapshotHook({ stat, snapshotAgeSeconds: STALE_SNAPSHOT_AGE_SECONDS });

    expect(result.exit).toEqual(CLEAN_EXIT);
    expect(result.stdout).toBe('');
  });

  it('points at a day-old snapshot while a driver is running', () => {
    const result = runSnapshotHook({
      stat,
      snapshotAgeSeconds: STALE_SNAPSHOT_AGE_SECONDS,
      driverRunning: true,
    });

    expect(result.exit).toEqual(CLEAN_EXIT);
    expect(result.stdout).toMatch(NUDGE);
  });
});
