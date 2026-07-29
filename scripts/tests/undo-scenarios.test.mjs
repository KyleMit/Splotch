import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ browser: null, outDir: '', stop: null }));

vi.mock('@playwright/test', () => ({
  chromium: { launch: (...args) => state.browser.launch(...args) },
}));

vi.mock('../perf/preview.mjs', () => ({
  buildAndPreview: async () => ({ base: 'http://profile.test/', stop: state.stop }),
}));

vi.mock('../perf/capture.mjs', () => ({
  startTrace: async () => [],
  stopTrace: async () => {},
  injectObservers: async () => {},
  readObservers: async () => ({ longTasks: [], frames: [], heapBytes: 0 }),
  heapBytes: async () => 0,
  markPhase: async (_page, _label, work) => work(),
}));

vi.mock('../perf/paths.mjs', () => ({ profilePath: () => state.outDir }));

vi.mock('../lib/playwright.mjs', () => ({ chromiumExecutablePath: () => undefined }));

vi.mock('../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sleep: async () => {} };
});

let fixtureDir;
let originalArgv;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-undo-scenarios-'));
  state.outDir = fixtureDir;
  state.stop = vi.fn();
  originalArgv = process.argv;
  // Enough budget for a quiesced tier to produce its consecutive identical
  // samples (Date.now is mocked to tick once per call, sleep is a no-op), while
  // still expiring for the scenario whose tier never stops changing.
  process.argv = [...process.argv, '--cold-tier-timeout-ms=20'];
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('undo scenario profiling', () => {
  it('writes artifacts and continues after a cold-tier timeout', async () => {
    let navigations = 0;
    let churn = 0;
    const page = {
      goto: vi.fn(async () => {
        navigations++;
      }),
      waitForSelector: vi.fn(async () => {}),
      waitForFunction: vi.fn(async () => {}),
      evaluate: vi.fn(async (fn) => {
        const source = fn.toString();
        if (source.includes('getUndoDebug')) {
          // One scenario's tier never quiesces — blobBytes keeps moving, so the
          // settle poll never sees two identical samples and the scenario is
          // skipped. The rest report a stable tier and settle immediately.
          return navigations === 3
            ? { snapshots: 22, liveRasters: 3, blobBytes: churn++ }
            : { snapshots: 22, liveRasters: 2, blobBytes: 1 };
        }
        if (source.includes('document.querySelector')) {
          return { backingW: 20, backingH: 20, side: 20, bytesPerRaster: 1600 };
        }
        if (source.includes("getEntriesByType('measure')")) {
          return {
            'engine.draw': { count: 1, total: 1, max: 1 },
            'engine.commit': { count: 1, total: 1, max: 1 },
            'engine.snapshot': { count: 1, total: 1, max: 1 },
            'engine.undo': { count: 1, total: 1, max: 1 },
          };
        }
        if (source.includes('async (maxUndoSteps)')) return 1;
        if (source.includes('performance.now')) return 0;
        return undefined;
      }),
      screenshot: vi.fn(async () => {}),
    };
    const cdp = { send: vi.fn(async () => {}) };
    const context = {
      newPage: vi.fn(async () => page),
      newCDPSession: vi.fn(async () => cdp),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };
    state.browser = { launch: vi.fn(async () => browser) };
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    await runUndoScenarios();

    const jsonPath = join(fixtureDir, 'undo-scenarios.json');
    const markdownPath = join(fixtureDir, 'undo-scenarios.md');
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);

    const summary = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(summary.scenarios).toHaveLength(7);
    expect(summary.scenarios).toContainEqual(
      expect.objectContaining({
        key: 'short-marks',
        skipped: true,
        error: expect.stringContaining(
          'cold tier never settled within 20 ms: snapshots=22 liveRasters=3'
        ),
      })
    );
    const laterScenario = summary.scenarios.find((scenario) => scenario.key === 'mixed');
    expect(laterScenario).toMatchObject({ draw: { ops: 1 } });
    expect(laterScenario).not.toHaveProperty('skipped');
    expect(readFileSync(markdownPath, 'utf8')).toContain(
      'Skipped: cold tier never settled within 20 ms: snapshots=22 liveRasters=3'
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping undo scenario short-marks: cold tier never settled within 20 ms'
      )
    );
    expect(state.stop).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
