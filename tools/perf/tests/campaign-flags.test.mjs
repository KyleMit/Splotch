import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// The capture entries' campaign flags, --orientation and --theme: each entry
// refuses a value no campaign has with its owner's one-line message, folds the
// letter case the way the owner does, and reads --orientation through the owner.

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const perfRoot = join(repoRoot, 'tools', 'perf');
const HOST_REQUIRED = '--host= is required — the probe host URL the device can reach over the LAN';
const FOREIGN_BUILD_NEEDS_URL =
  '--allow-foreign-build needs --url= naming the externally served build it allows';

let fixtureDir;

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-campaign-flags-'));
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

// Every spawned entry gets an Android SDK path with no adb in it, so an entry
// that slips past its argument checks stops before it reaches a real device.
const unreachableAndroidHome = () => join(fixtureDir, 'no-android-sdk');
const unreachableAdbRefusal = () =>
  `adb devices failed (spawnSync ${join(unreachableAndroidHome(), 'platform-tools', 'adb')} ENOENT)` +
  ' — no device was checked';
// Each entry's first offline refusal after its campaign-flag parses. The
// refusal cases pass these args too, so an entry whose check is lost still
// stops there instead of starting device work.
const CAMPAIGN_FLAG_ENTRIES = [
  {
    entry: 'android/capture-browser-actions.mjs',
    flags: ['orientation', 'theme'],
    nextArgs: [],
    nextRefusal: unreachableAdbRefusal,
  },
  {
    entry: 'android/capture-bundled-frames.mjs',
    flags: ['orientation', 'theme'],
    nextArgs: ['--seconds=0'],
    nextRefusal: () => '--seconds must be a number > 0, got "0"',
  },
  {
    entry: 'android/capture-clear-drag.mjs',
    flags: ['orientation'],
    nextArgs: ['--allow-foreign-build'],
    nextRefusal: () => FOREIGN_BUILD_NEEDS_URL,
  },
  {
    entry: 'ios/capture-xcuitest-actions.mjs',
    flags: ['orientation', 'theme'],
    nextArgs: ['--allow-foreign-build'],
    nextRefusal: () => FOREIGN_BUILD_NEEDS_URL,
  },
  {
    entry: 'ios/capture-xcuitest-screen.mjs',
    flags: ['orientation', 'theme'],
    // The capabilities file stands in for a signing config and is refused
    // before it is read; --native-app skips a Safari capture's LAN lookup.
    nextArgs: ['--capabilities-file=never-read.json', '--native-app', '--gesture-repeats=0'],
    nextRefusal: () => '--gesture-repeats must be an integer >= 1, got "0"',
  },
  {
    entry: 'split-capture/capture-device-frames.mjs',
    flags: ['orientation'],
    nextArgs: [],
    nextRefusal: () => HOST_REQUIRED,
  },
  {
    entry: 'split-capture/capture-hand-input.mjs',
    flags: ['orientation'],
    nextArgs: [],
    nextRefusal: () => HOST_REQUIRED,
  },
  {
    entry: 'web/capture-desktop-actions.mjs',
    flags: ['theme'],
    nextArgs: ['--allow-foreign-build'],
    nextRefusal: () => FOREIGN_BUILD_NEEDS_URL,
  },
  {
    entry: 'web/capture-local-frames.mjs',
    flags: ['theme'],
    nextArgs: ['--brush=quill'],
    nextRefusal: () => '--brush must be one of pen, crayon, magic, eraser',
    // Otherwise the entry warns on stderr that the engine's marks are absent.
    env: { PERF_MARKS: 'true' },
  },
];
// Per flag: a value no campaign has, its owner's refusal, and a spelling in
// the other letter case, which the owner folds.
const CAMPAIGN_FLAGS = {
  orientation: {
    unknown: 'square',
    refusal: '--orientation must be PORTRAIT or LANDSCAPE',
    folded: 'landscape',
  },
  theme: { unknown: 'sepia', refusal: '--theme must be light or dark', folded: 'DARK' },
};
const CAMPAIGN_FLAG_CASES = CAMPAIGN_FLAG_ENTRIES.flatMap(({ flags, ...row }) =>
  flags.map((flag) => ({ ...row, ...CAMPAIGN_FLAGS[flag], flag }))
);

function expectRefusal({ entry, env }, args, message) {
  const result = spawnSync(process.execPath, [join(perfRoot, entry), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ANDROID_HOME: unreachableAndroidHome(), ...env },
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`${message}\n`);
}

describe('a capture entry’s campaign flags', () => {
  it.each(CAMPAIGN_FLAG_CASES)('$entry refuses a --$flag no campaign has', (row) => {
    expectRefusal(row, [`--${row.flag}=${row.unknown}`, ...row.nextArgs], row.refusal);
  });

  it.each(CAMPAIGN_FLAG_CASES)('$entry takes --$flag=$folded through to its next check', (row) => {
    expectRefusal(row, [`--${row.flag}=${row.folded}`, ...row.nextArgs], row.nextRefusal());
  });
});

const calleeName = ({ expression }) =>
  ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : '';

// Every call to a perf flag helper (flag, argFlag, readValueFlag, …) with a
// static 'orientation' argument, and whether it is parseCampaignOrientation's
// argument — the one owner of the orientation vocabulary.
function orientationReads(source) {
  const file = ts.createSourceFile(
    'entry.mjs',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const reads = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      /flag$/i.test(calleeName(node)) &&
      node.arguments.some((arg) => ts.isStringLiteralLike(arg) && arg.text === 'orientation')
    ) {
      const { parent } = node;
      reads.push({
        read: node.getText(file),
        owned:
          ts.isCallExpression(parent) &&
          calleeName(parent) === 'parseCampaignOrientation' &&
          parent.arguments[0] === node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return reads;
}

describe('the --orientation vocabulary owner', () => {
  it('tells a read through parseCampaignOrientation from one that bypasses it', () => {
    expect(orientationReads("const o = flag('orientation')?.toUpperCase();")).toEqual([
      { read: "flag('orientation')", owned: false },
    ]);
    expect(orientationReads("const { o = argFlag('orientation', 'PORTRAIT') } = {};")).toEqual([
      { read: "argFlag('orientation', 'PORTRAIT')", owned: false },
    ]);
    expect(orientationReads("readValueFlag(argv, 'orientation');")).toEqual([
      { read: "readValueFlag(argv, 'orientation')", owned: false },
    ]);
    expect(orientationReads("parseCampaignOrientation(argFlag('orientation')) ?? 'x';")).toEqual([
      { read: "argFlag('orientation')", owned: true },
    ]);
  });

  // A commented-out owner call is not ownership, and a template-literal
  // spelling of the flag name is still a read.
  it('ignores comments and reads a template-literal flag name', () => {
    const source = [
      "// const o = parseCampaignOrientation(flag('orientation'));",
      'const o = flag(`orientation`)?.toUpperCase();',
    ].join('\n');

    expect(orientationReads(source)).toEqual([{ read: 'flag(`orientation`)', owned: false }]);
  });

  it('reads every perf entry’s --orientation through parseCampaignOrientation', () => {
    const reads = readdirSync(perfRoot, { recursive: true })
      .filter((path) => path.endsWith('.mjs') && !path.startsWith(`tests${sep}`))
      .flatMap((path) =>
        orientationReads(readFileSync(join(perfRoot, path), 'utf8')).map((read) => ({
          path: path.split(sep).join('/'),
          ...read,
        }))
      );

    expect(reads.filter(({ owned }) => !owned)).toEqual([]);
    expect(reads.map(({ path }) => path)).toEqual(
      expect.arrayContaining(
        CAMPAIGN_FLAG_ENTRIES.filter(({ flags }) => flags.includes('orientation')).map(
          ({ entry }) => entry
        )
      )
    );
  });
});
