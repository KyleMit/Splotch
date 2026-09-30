import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { DEFAULT_SIZE_LEVEL, SIZE_PX, replayInPage } from '../web/replay-input-recording.mjs';
import { CONTACT_BANK_MS } from '../split-capture/lib/probe-host-protocol.mjs';
import { DRAW_SECONDS } from '../split-capture/capture-hand-input.mjs';

const state = vi.hoisted(() => ({ directEntryUrl: null, runMain: vi.fn() }));
const chromium = vi.hoisted(() => ({ connectOverCDP: vi.fn() }));

vi.mock('@playwright/test', () => ({ chromium }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isMain: (url) => url === state.directEntryUrl, runMain: state.runMain };
});

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const perfRoot = join(repoRoot, 'tools', 'perf');
const analyzePath = join(repoRoot, 'tools', 'perf', 'analyze-chrome-trace.mjs');
const webInspectorPath = join(repoRoot, 'tools', 'perf', 'analyze-web-inspector.mjs');
const replayPath = join(repoRoot, 'tools', 'perf', 'web', 'replay-input-recording.mjs');
const scenarioPath = join(repoRoot, 'tools', 'perf', 'web', 'capture-web-session.mjs');
const undoScenariosPath = join(repoRoot, 'tools', 'perf', 'web', 'run-undo-scenarios.mjs');
const handCapturePath = join(repoRoot, 'tools', 'perf', 'split-capture', 'capture-hand-input.mjs');
const HOST_REQUIRED = '--host= is required — the probe host URL the device can reach over the LAN';
const FOREIGN_BUILD_NEEDS_URL =
  '--allow-foreign-build needs --url= naming the externally served build it allows';
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

let fixtureDir;

// Replays recorded UI actions against a stub engine in turbo mode.
async function replayActions(actions) {
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) };
  const engine = Object.fromEntries(
    [
      'setStrokeWidth',
      'setColor',
      'setEraserMode',
      'setMagicMode',
      'setCrayonMode',
      'clearCanvas',
    ].map((method) => [method, vi.fn()])
  );
  vi.stubGlobal('document', { querySelector: () => canvas });
  vi.stubGlobal('window', { __engine: engine });
  vi.stubGlobal('requestAnimationFrame', (callback) => callback());
  await replayInPage({
    events: actions.map(([name, value]) => ({ kind: 'action', name, value })),
    recCanvas: { w: 1, h: 1 },
    sizePx: SIZE_PX,
    defaultSizeLevel: DEFAULT_SIZE_LEVEL,
    turbo: true,
    maxIdleGapMs: 0,
  });
  return engine;
}

beforeEach(() => {
  state.directEntryUrl = null;
  state.runMain.mockClear();
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-perf-cli-'));
});

afterEach(() => {
  state.directEntryUrl = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  rmSync(fixtureDir, { recursive: true, force: true });
});

function expectCliFailure(script, args, message) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ANDROID_HOME: unreachableAndroidHome() },
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`${message}\n`);
}

function analyzeWebInspector(recording) {
  const path = join(fixtureDir, 'webinspector.json');
  writeFileSync(path, JSON.stringify({ version: 1, recording }));
  const result = spawnSync(process.execPath, [webInspectorPath, path], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return result.stdout;
}

describe('performance CLI input failures', () => {
  it('reports a missing Chrome trace', () => {
    const path = join(fixtureDir, 'missing-trace.json');

    expectCliFailure(analyzePath, [path], `Trace not found: ${path}`);
  });

  it('reports invalid Chrome trace JSON', () => {
    const path = join(fixtureDir, 'trace.json');
    writeFileSync(path, '');

    expectCliFailure(analyzePath, [path], `Trace is not valid JSON: ${path}`);
  });

  it('reports a missing Web Inspector export', () => {
    const path = join(fixtureDir, 'missing-webinspector.json');

    expectCliFailure(
      webInspectorPath,
      [path],
      `Web Inspector export not found or unreadable: ${path}`
    );
  });

  it('reports invalid Web Inspector JSON', () => {
    const path = join(fixtureDir, 'webinspector.json');
    writeFileSync(path, '');

    expectCliFailure(webInspectorPath, [path], `Web Inspector export is not valid JSON: ${path}`);
  });

  it('reports a Web Inspector export without a recording', () => {
    const path = join(fixtureDir, 'webinspector.json');
    writeFileSync(path, JSON.stringify({ version: 1 }));

    expectCliFailure(
      webInspectorPath,
      [path],
      `${path} is not a Web Inspector export (no .recording)`
    );
  });

  it('reports a missing replay recording', () => {
    const path = join(fixtureDir, 'missing-replay.json');

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording not found or unreadable: ${path}`
    );
  });

  it('reports invalid replay recording JSON', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, '');

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording is not valid JSON: ${path}`
    );
  });

  it('reports a replay recording without an events array', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, JSON.stringify({ meta: {} }));

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording has no events array: ${path}`
    );
  });

  // An unknown level used to replay at the default width, so every later
  // stroke landed at a size the device never drew.
  it('reports a replay recording that selects a size level the app does not have', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(
      path,
      JSON.stringify({
        events: [
          { kind: 'action', name: 'size', value: 2 },
          { kind: 'action', name: 'size', value: 9 },
          { kind: 'action', name: 'eraser-size', value: 0 },
        ],
      })
    );

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording selects size level 9, 0, which the app does not have (known: 1, 2, 3, 4, 5): ${path}`
    );
  });

  it('reports an unknown --device instead of profiling the default viewport', () => {
    expectCliFailure(
      scenarioPath,
      ['--device=tabelt'],
      'Unknown --device=tabelt — known: phone, tablet, desktop'
    );
  });

  it('reports a malformed --strokes instead of building empty scenarios', () => {
    expectCliFailure(
      undoScenariosPath,
      ['--strokes=abc'],
      '--strokes must be an integer >= 1, got "abc"'
    );
  });

  // `--strokes=2.5` built two strokes under a label that said 2.5.
  it('reports a fractional --strokes instead of truncating it', () => {
    expectCliFailure(
      undoScenariosPath,
      ['--strokes=2.5'],
      '--strokes must be an integer >= 1, got "2.5"'
    );
  });

  it('reports a malformed --hz instead of an unthrottled/NaN-derived run', () => {
    expectCliFailure(undoScenariosPath, ['--hz=abc'], '--hz must be a number > 0, got "abc"');
  });

  // `--hz=0` made the frame budget Infinity, so every commit passed.
  it('reports a zero --hz instead of an infinite frame budget', () => {
    expectCliFailure(undoScenariosPath, ['--hz=0'], '--hz must be a number > 0, got "0"');
  });

  // The probe stops recording once the finger banks CONTACT_BANK_MS, and the cues
  // and late timers stretch the drawer's window past --seconds, so a window as
  // long as the bank counted down over a phase that had already ended.
  it('reports a hand --seconds whose window would reach the probe contact bank', () => {
    const bankSeconds = CONTACT_BANK_MS / 1_000;

    expectCliFailure(
      handCapturePath,
      [`--seconds=${bankSeconds}`],
      `--seconds must be an integer >= 1 and <= ${DRAW_SECONDS.max}, got "${bankSeconds}"`
    );
  });

  // The countdown steps whole seconds, so `--seconds=2.5` drew for 3 s while the
  // artifact recorded 2.5.
  it('reports a fractional hand --seconds instead of drawing past it', () => {
    expectCliFailure(
      handCapturePath,
      ['--seconds=2.5'],
      `--seconds must be an integer >= 1 and <= ${DRAW_SECONDS.max}, got "2.5"`
    );
  });

  it('lets the longest hand --seconds through to the --host check', () => {
    expectCliFailure(
      handCapturePath,
      [`--seconds=${DRAW_SECONDS.max}`],
      '--host= is required — the probe host URL the device can reach over the LAN'
    );
  });

  it('refuses an unknown flag instead of running without it', () => {
    const result = spawnSync(process.execPath, [undoScenariosPath, '--stroke=4'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^Unknown flag --stroke=4 — known flags: .*\bstrokes\b/);
  });

  it.each(CAMPAIGN_FLAG_CASES)(
    '$entry refuses a --$flag no campaign has',
    ({ entry, flag, unknown, refusal, nextArgs }) => {
      expectCliFailure(join(perfRoot, entry), [`--${flag}=${unknown}`, ...nextArgs], refusal);
    }
  );

  it.each(CAMPAIGN_FLAG_CASES)(
    '$entry takes --$flag=$folded through to its next check',
    ({ entry, flag, folded, nextArgs, nextRefusal }) => {
      expectCliFailure(join(perfRoot, entry), [`--${flag}=${folded}`, ...nextArgs], nextRefusal());
    }
  );

  // The drift guard for SIZE_PX and DEFAULT_SIZE_LEVEL: the app's SIZE_TO_PX and
  // DEFAULT_SIZE live in a Svelte rune module no Node code can import, so they
  // are read from the source text.
  it('replays every recorded size level at the app stroke width', async () => {
    const strokeWidthSource = readFileSync(
      join(repoRoot, 'web/src/lib/state/strokeWidth.svelte.ts'),
      'utf8'
    );
    const appTable = /const SIZE_TO_PX\b[^=]*=\s*\{([^}]*)\}/.exec(strokeWidthSource)?.[1];
    const appWidths = Object.fromEntries(
      [...(appTable ?? '').matchAll(/(\d+):\s*(\d+)/g)].map(([, level, px]) => [level, Number(px)])
    );
    expect(Object.keys(appWidths)).not.toHaveLength(0);
    expect(SIZE_PX).toEqual(appWidths);
    const appDefault = /export const DEFAULT_SIZE\b[^=]*=\s*(\d+);/.exec(strokeWidthSource)?.[1];
    expect(DEFAULT_SIZE_LEVEL).toBe(Number(appDefault));

    const levels = Object.keys(appWidths).map(Number);
    const engine = await replayActions(levels.map((level) => ['size', level]));

    expect(engine.setStrokeWidth.mock.calls.flat()).toEqual([
      SIZE_PX[DEFAULT_SIZE_LEVEL],
      ...levels.map((level) => appWidths[level]),
    ]);
  });

  // The app hands the engine the active tool's level width, unmultiplied; the
  // engine scales eraser strokes by ERASER_SIZE_MULTIPLIER itself. A replay that
  // multiplied here would erase at twice the app's width.
  it('keeps the pen and eraser levels apart and pushes the active one, as the app does', async () => {
    const earlyBoot = readFileSync(join(repoRoot, 'web/src/lib/drawing/earlyBoot.ts'), 'utf8');
    expect(earlyBoot).toContain('setStrokeWidth(getStrokeWidthPx(activeStrokeSize()))');

    const engine = await replayActions([
      ['size', 5],
      ['brush', 'eraser'],
      ['eraser-size', 1],
      ['brush', 'crayon'],
      ['color', '#000000'],
      ['brush', 'eraser'],
      ['color', '#000000'],
      ['eraser'],
      ['clear'],
    ]);

    expect(engine.setStrokeWidth.mock.calls.flat()).toEqual([
      SIZE_PX[DEFAULT_SIZE_LEVEL],
      SIZE_PX[5],
      SIZE_PX[DEFAULT_SIZE_LEVEL],
      SIZE_PX[1],
      SIZE_PX[5],
      SIZE_PX[1],
      SIZE_PX[5],
      SIZE_PX[1],
      SIZE_PX[5],
    ]);
    expect(engine.setEraserMode).toHaveBeenLastCalledWith(false);
    expect(engine.setCrayonMode).toHaveBeenLastCalledWith(true);
  });

  // The app's resetToolAfterClear lifts the child out of the eraser only; the
  // magic brush survives a clear.
  it('keeps the magic brush through a clear', async () => {
    const engine = await replayActions([['brush', 'magic'], ['clear']]);

    expect(engine.setMagicMode).toHaveBeenLastCalledWith(true);
    expect(engine.clearCanvas).toHaveBeenCalledOnce();
  });

  it('imports the Android profiler without starting its driver', async () => {
    spawnSync.mockClear();
    chromium.connectOverCDP.mockClear();

    await import('../android/capture-webview-session.mjs');

    expect(spawnSync).not.toHaveBeenCalled();
    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
    expect(state.runMain).not.toHaveBeenCalled();
  });

  it('selects a navigated WebView page over an about page', async () => {
    const { getWebviewPage } = await import('../android/capture-webview-session.mjs');
    const aboutPage = { url: vi.fn(() => 'about:blank') };
    const navigatedPage = { url: vi.fn(() => 'https://splotch.art/') };
    const context = { pages: vi.fn(() => [aboutPage, navigatedPage]) };
    const browser = { contexts: vi.fn(() => [context]) };

    await expect(getWebviewPage(browser)).resolves.toBe(navigatedPage);
    expect(context.pages).toHaveBeenCalledOnce();
  });

  it('reports when CDP exposes only about pages', async () => {
    vi.useFakeTimers();
    const { getWebviewPage } = await import('../android/capture-webview-session.mjs');
    const context = { pages: vi.fn(() => [{ url: () => 'about:blank' }]) };
    const browser = { contexts: vi.fn(() => [context]) };
    const page = getWebviewPage(browser);
    // Attach the expectation before the timers advance: the rejection is otherwise
    // unhandled for a tick and reported as an error even though it is asserted.
    // eslint-disable-next-line vitest/valid-expect -- awaited below as `rejection`; the rule only sees the statement it is declared in
    const rejection = expect(page).rejects.toThrow(
      'No navigated WebView page was exposed over CDP'
    );

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(context.pages).toHaveBeenCalledTimes(21);
  });

  it('starts each guarded profiler when invoked directly', async () => {
    const drivers = [
      ['../web/capture-web-session.mjs', 'runWebScenario'],
      ['../web/capture-web-mount.mjs', 'runMountProfile'],
      ['../web/capture-webkit-session.mjs', 'runIosProfile'],
      ['../android/capture-webview-session.mjs', 'runAndroidProfile'],
    ];

    for (const [path, entry] of drivers) {
      vi.resetModules();
      state.runMain.mockClear();
      state.directEntryUrl = new URL(path, import.meta.url).href;
      const module = await import(path);

      expect(module[entry]).toBeTypeOf('function');
      expect(state.runMain).toHaveBeenCalledExactlyOnceWith(module[entry]);
    }
  });
});

describe('Web Inspector analysis', () => {
  const undoRecord = { startTime: 0.09, endTime: 0.11, type: 'script' };

  it('uses the enclosing record for current synchronous tiled undo', () => {
    const output = analyzeWebInspector({
      startTime: 0,
      endTime: 1,
      records: [undoRecord],
      markers: [
        { time: 0.1, details: 'engine.undo:start' },
        { time: 0.5, details: 'engine.undo:end' },
      ],
    });

    expect(output).toMatch(/engine\.undo\s+count=\s+1\s+n=1\s+min=20\.00.*\[enclosing record\]/);
  });

  it('uses paired marks for asynchronous undo in archived snapshot/blob recordings', () => {
    const output = analyzeWebInspector({
      startTime: 0,
      endTime: 1,
      records: [undoRecord],
      markers: [
        { time: 0.1, details: 'engine.undo:start' },
        { time: 0.2, details: 'engine.reinflate:start' },
        { time: 0.3, details: 'engine.reinflate:end' },
        { time: 0.5, details: 'engine.undo:end' },
      ],
    });

    expect(output).toMatch(/engine\.undo\s+count=\s+1\s+n=1\s+min=400\.00.*\[paired marks\]/);
  });
});

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
      expect.arrayContaining(CAMPAIGN_FLAG_ENTRIES.map(({ entry }) => entry))
    );
  });
});
