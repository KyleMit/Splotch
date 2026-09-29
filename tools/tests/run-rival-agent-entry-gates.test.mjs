// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Node realpaths a symlinked entry before building import.meta.url and leaves argv[1] as typed, so
// a hand-rolled argv[1] comparison never matches from a checkout reached through a symlink (macOS
// /tmp and $TMPDIR are symlinks). The script then exits 0 having checked nothing, and these
// preflights are judged by exit code.
const repoRoot = join(import.meta.dirname, '..', '..');
const PACKAGE_SCRIPT_DIRECTORIES = [
  '.claude/skills/run-rival-agent/scripts',
  '.agents/skills/run-rival-agent/scripts',
];

// Each case stops at its first check against an empty home, so none reads or writes the real one.
const ENTRY_CASES = [
  ['.claude/skills/run-rival-agent/scripts/codex-health.mjs', [], /no Codex login at /],
  [
    '.agents/skills/run-rival-agent/scripts/check-codex-policy.mjs',
    [],
    /missing Codex policy file/,
  ],
  [
    '.agents/skills/run-rival-agent/scripts/install-codex-policy.mjs',
    ['unexpected'],
    /install-codex-policy\.mjs accepts no arguments/,
  ],
  [
    '.agents/skills/run-rival-agent/scripts/install-run-claude.mjs',
    ['--check', '--unexpected'],
    /--unexpected/,
  ],
];

describe('run-rival-agent package scripts run through a symlinked checkout', () => {
  let fixtureDir;
  let linkedRoot;
  let home;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-rival-entry-'));
    linkedRoot = join(fixtureDir, 'checkout');
    home = join(fixtureDir, 'home');
    mkdirSync(home);
    symlinkSync(repoRoot, linkedRoot, 'dir');
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it.each(ENTRY_CASES)('%s runs its CLI', (script, args, stderr) => {
    const result = spawnSync(process.execPath, [join(linkedRoot, script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex') },
    });

    expect(result.stderr).toMatch(stderr);
    expect(result.status).toBe(1);
  });
});

describe('run-rival-agent package scripts gate on a realpath-aware check', () => {
  const scripts = PACKAGE_SCRIPT_DIRECTORIES.flatMap((directory) =>
    readdirSync(join(repoRoot, directory))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => join(directory, name))
  );

  it('finds every script the symlink cases spawn', () => {
    expect(scripts).toEqual(expect.arrayContaining(ENTRY_CASES.map(([script]) => script)));
  });

  // isMain (tools/lib/proc.mjs) for scripts that run from the checkout; isEntryPoint
  // (tools/rival-agent/broker-server.mjs) for the files the installer copies out of it.
  it.each(scripts)('%s never compares process.argv[1] by hand', (script) => {
    expect(readFileSync(join(repoRoot, script), 'utf8')).not.toMatch(/process\.argv\[1\]/);
  });
});
