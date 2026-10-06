import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInThisContext } from 'node:vm';
import { DEFAULT_SIZE_LEVEL, SIZE_PX, replayInPage } from '../web/replay-input-recording.mjs';
import { CONTACT_BANK_MS } from '../split-capture/lib/probe-host-protocol.mjs';
import { DRAW_SECONDS } from '../split-capture/capture-hand-input.mjs';
import {
  STROKE_SIZES,
  DEFAULT_SIZE,
  getStrokeWidthPx,
} from '../../../web/src/lib/drawing/strokeSettings.ts';

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
const perfEntryPath = (entry) => join(repoRoot, 'tools', 'perf', entry);
const analyzePath = join(repoRoot, 'tools', 'perf', 'analyze-chrome-trace.mjs');
const webInspectorPath = join(repoRoot, 'tools', 'perf', 'analyze-web-inspector.mjs');
const replayPath = join(repoRoot, 'tools', 'perf', 'web', 'replay-input-recording.mjs');
const TYPE_STRIP_FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
const scenarioPath = join(repoRoot, 'tools', 'perf', 'web', 'capture-web-session.mjs');
const undoScenariosPath = join(repoRoot, 'tools', 'perf', 'web', 'run-undo-scenarios.mjs');
const handCapturePath = join(repoRoot, 'tools', 'perf', 'split-capture', 'capture-hand-input.mjs');
// Every spawned entry gets an Android SDK path with no adb in it, so an entry
// that slips past its argument checks stops before it reaches a real device.
const unreachableAndroidHome = () => join(fixtureDir, 'no-android-sdk');
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
  // Playwright serializes the function, so module closures must be unavailable.
  const replay = runInThisContext(`(${replayInPage.toString()})`);
  await replay({
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

function expectCliFailure(script, args, message, execArgv = []) {
  const result = spawnSync(process.execPath, [...execArgv, script, ...args], {
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
      `Replay recording not found or unreadable: ${path}`,
      TYPE_STRIP_FLAGS
    );
  });

  it('reports invalid replay recording JSON', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, '');

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording is not valid JSON: ${path}`,
      TYPE_STRIP_FLAGS
    );
  });

  it('reports a replay recording without an events array', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, JSON.stringify({ meta: {} }));

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording has no events array: ${path}`,
      TYPE_STRIP_FLAGS
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
      `Replay recording selects size level 9, 0, which the app does not have (known: 1, 2, 3, 4, 5): ${path}`,
      TYPE_STRIP_FLAGS
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

  it('replays every recorded size level at the app stroke width', async () => {
    const engine = await replayActions(STROKE_SIZES.map((level) => ['size', level]));

    expect(engine.setStrokeWidth.mock.calls.flat()).toEqual([
      getStrokeWidthPx(DEFAULT_SIZE),
      ...STROKE_SIZES.map(getStrokeWidthPx),
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

// Each entry's whole flag set, beside the arguments that keep it harmless should
// its refusal go missing: a dry run inventories instead of releasing the rig, a
// bare serial or a zero port stops before a device or a server, and the rest
// stop at a missing target or path. Empty stdout proves the refusal came first.
const FLAG_REFUSING_ENTRIES = [
  [
    'run-campaign.mjs',
    [],
    [
      'dry-run',
      'accept-instrument-change',
      'target',
      'output-root',
      'max-attempts',
      'modes',
      'items',
      'label',
      'ledger',
      'reboot-simulator',
      'appium-url',
      'capabilities-file',
      'device-id',
      'cdp-port',
      'url',
      'probe-host',
      'wda-url',
    ],
  ],
  [
    'release-capture.mjs',
    ['--dry-run'],
    ['dry-run', 'host-only', 'stop-campaigns', 'json', 'android-serial'],
  ],
  [
    'prepare-capture.mjs',
    ['--android-serial'],
    [
      'wake-android',
      'json',
      'android-serial',
      'ios-udid',
      'ios-only',
      'verify-android-input',
      'verify-ios-launch',
      'hold-android-awake',
      'appium-url',
    ],
  ],
  [
    'campaign-sources.mjs',
    [],
    [
      'target',
      'output-root',
      'product-commit',
      'manifest',
      'preserve-actions',
      'actions-unavailable',
      'modes',
      'sections',
    ],
  ],
  ['serve-profile-build.mjs', ['--port=0'], ['port', 'strict-port']],
  ['analyze-frame-capture.mjs', [], ['include-unattributable', 'no-forensics']],
  ['report-undo-gate-failures.mjs', [], ['first']],
  ['analyze-web-inspector.mjs', [], []],
];

describe('perf entry flag refusals', () => {
  it.each(FLAG_REFUSING_ENTRIES)(
    '%s refuses an unknown flag before it acts',
    (entry, guard, known) => {
      expectCliFailure(
        perfEntryPath(entry),
        [...guard, '--definitely-not-a-flag'],
        `Unknown flag --definitely-not-a-flag — known flags: ${known.toSorted().join(', ')}`
      );
    }
  );

  // Read as absent, `--dry-run=true` started the campaign queue and released the
  // rig. Release's bare --dry-run keeps a regressed read in its inventory mode.
  it.each([
    ['run-campaign.mjs', ['--dry-run=true']],
    ['release-capture.mjs', ['--dry-run', '--dry-run=true']],
  ])('%s refuses a --dry-run written with a value', (entry, args) => {
    expectCliFailure(
      perfEntryPath(entry),
      args,
      '--dry-run is a switch: write --dry-run with no value'
    );
  });

  // Empty stdout cannot prove these came first: the exported functions read the
  // serial and the UDID only after writing to the phone or stopping the rig, and
  // print nothing before that. So the PATH holds only shims that log each call.
  it.each([
    ['prepare-capture.mjs', 'ios-udid', ['--wake-android', '--ios-udid']],
    ['release-capture.mjs', 'android-serial', ['--dry-run', '--android-serial']],
  ])('%s refuses a bare --%s before running any command', (entry, flag, args) => {
    const bin = join(fixtureDir, 'bin');
    const log = join(fixtureDir, 'commands.log');
    mkdirSync(bin);
    for (const command of ['adb', 'git', 'idevice_id', 'lsof', 'pgrep', 'ps', 'sh', 'xcrun']) {
      const shim = `#!/bin/sh\necho "${command} $*" >> '${log}'\nexit 1\n`;
      writeFileSync(join(bin, command), shim, { mode: 0o755 });
    }

    const result = spawnSync(process.execPath, [perfEntryPath(entry), ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { PATH: bin },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`--${flag} takes a value: write --${flag}=<value>\n`);
    expect(existsSync(log)).toBe(false);
  });
});

describe('Web Inspector analysis', () => {
  const undoRecord = { startTime: 0.09, endTime: 0.11, type: 'script' };

  it('imports without reading an export', async () => {
    const { analyzeWebInspector } = await import('../analyze-web-inspector.mjs');

    expect(analyzeWebInspector).toBeTypeOf('function');
  });

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
