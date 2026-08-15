import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SIZE_PX, replayInPage } from '../web/replay-input-recording.mjs';

const state = vi.hoisted(() => ({ directEntry: false, runMain: vi.fn() }));
const chromium = vi.hoisted(() => ({ connectOverCDP: vi.fn() }));

vi.mock('@playwright/test', () => ({ chromium }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isMain: () => state.directEntry, runMain: state.runMain };
});

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const analyzePath = join(repoRoot, 'tools', 'perf', 'analyze-chrome-trace.mjs');
const webInspectorPath = join(repoRoot, 'tools', 'perf', 'analyze-web-inspector.mjs');
const replayPath = join(repoRoot, 'tools', 'perf', 'web', 'replay-input-recording.mjs');
const scenarioPath = join(repoRoot, 'tools', 'perf', 'web', 'capture-web-session.mjs');
const undoScenariosPath = join(repoRoot, 'tools', 'perf', 'web', 'run-undo-scenarios.mjs');

let fixtureDir;

beforeEach(() => {
  state.directEntry = false;
  state.runMain.mockClear();
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-perf-cli-'));
});

afterEach(() => {
  state.directEntry = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  rmSync(fixtureDir, { recursive: true, force: true });
});

function expectCliFailure(script, args, message) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
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

  it('reports an unknown --device instead of profiling the default viewport', () => {
    expectCliFailure(
      scenarioPath,
      ['--device=tabelt'],
      'Unknown --device=tabelt — known: phone, tablet, desktop'
    );
  });

  it('reports a malformed --strokes instead of building empty scenarios', () => {
    expectCliFailure(undoScenariosPath, ['--strokes=abc'], '--strokes must be a number, got "abc"');
  });

  it('reports a malformed --hz instead of an unthrottled/NaN-derived run', () => {
    expectCliFailure(undoScenariosPath, ['--hz=abc'], '--hz must be a number, got "abc"');
  });

  it('replays every recorded size level at the app stroke width', async () => {
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) };
    const engine = { setStrokeWidth: vi.fn() };
    vi.stubGlobal('document', { querySelector: () => canvas });
    vi.stubGlobal('window', { __engine: engine });
    vi.stubGlobal('requestAnimationFrame', (callback) => callback());

    await replayInPage({
      events: [1, 2, 3, 4, 5].map((value) => ({ kind: 'action', name: 'size', value })),
      recCanvas: { w: 1, h: 1 },
      sizePx: SIZE_PX,
      turbo: true,
      maxIdleGapMs: 0,
    });

    expect(engine.setStrokeWidth).toHaveBeenNthCalledWith(1, 2);
    expect(engine.setStrokeWidth).toHaveBeenNthCalledWith(2, 4);
    expect(engine.setStrokeWidth).toHaveBeenNthCalledWith(3, 8);
    expect(engine.setStrokeWidth).toHaveBeenNthCalledWith(4, 14);
    expect(engine.setStrokeWidth).toHaveBeenNthCalledWith(5, 22);
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
    state.directEntry = true;

    for (const [path, entry] of drivers) {
      vi.resetModules();
      state.runMain.mockClear();
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
