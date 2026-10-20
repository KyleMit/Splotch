import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityDriver } from '../lib/parity-driver.mjs';
import { runParitySlice } from '../run-parity-slice.mjs';

// The device, the recorder, the settle wait, and the driver are stand-ins, so a run here reaches
// no device; the real DS-2 step list and the real step recorder run against them.
vi.mock('../lib/appium-session.mjs', () => ({
  readSessionFile: () => ({
    platform: 'ios',
    device: 'simulator',
    setOrientation: async () => {},
    source: async () => '<XCUIElementTypeApplication/>',
  }),
}));
vi.mock('../lib/parity-lifecycle.mjs', () => ({
  freshInstall: () => {},
  runtimeLabel: () => 'iOS simulator',
  setAppearance: () => {},
}));
vi.mock('../lib/parity-driver.mjs', () => ({ createParityDriver: vi.fn() }));
vi.mock('../lib/screen-recording.mjs', () => ({
  startScreenRecording: async () => ({ startedAt: Date.now(), stop: async () => {} }),
}));
vi.mock('../lib/settle-capture.mjs', () => ({
  settleCapture: async () => ({ settled: true, frames: 3 }),
}));
vi.mock('../lib/device-commands.mjs', () => ({
  screenshot: () => Buffer.from('png'),
  simctl: () => '',
}));
vi.mock('../../lib/proc.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  sleep: async () => {},
}));

const APP = 'art.example.app';
const FOREGROUND_ERROR = `foreground is other.app, expected ${APP}`;
const WINDOW = { tag: 'XCUIElementTypeApplication', frame: { x: 0, y: 0, w: 1024, h: 1366 } };

// Size 5 is in the width menu, which the drawer holds: it can be picked only after the steps
// that expand the drawer and open the menu.
function fakeDriver({ failingTaps = {} } = {}) {
  const taps = [];
  const state = { drawerOpen: false, widthMenuOpen: false };
  async function tap(key) {
    if (failingTaps[key]) throw new Error(failingTaps[key]);
    if (key === 'Size 5' && !(state.drawerOpen && state.widthMenuOpen)) {
      throw new Error('timeout waiting for Size 5');
    }
    if (key === 'Expand controls') state.drawerOpen = true;
    if (key === 'Stroke width') state.widthMenuOpen = !state.widthMenuOpen;
    taps.push(key);
    return Date.now();
  }
  const driver = {
    ios: true,
    inputs: [],
    nameFor: (key) => key,
    findName: async () => ['element'],
    waitFor: async (find) => find(),
    dismissImmersiveNotice: async () => {},
    launch: async () => Date.now(),
    terminate: async () => {},
    nodes: async () => [WINDOW],
    framesOf: () => ({}),
    tap,
  };
  return { driver, taps };
}

let out;
let originalExitCode;

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'parity-slice-'));
  originalExitCode = process.exitCode;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  rmSync(out, { recursive: true, force: true });
});

function runDs2(stepIds, fake) {
  vi.mocked(createParityDriver).mockReturnValue(fake.driver);
  const armsFile = join(out, 'arms.json');
  const arm = {
    kind: 'native',
    bundleId: APP,
    sourceSha: 'abc123',
    ios: { app: 'a', digest: 'd' },
  };
  writeFileSync(armsFile, JSON.stringify({ rn: arm }));
  return runParitySlice({
    sessionFile: 'session.json',
    target: 'ios-simulator',
    armsFile,
    armTags: ['rn'],
    slice: 'ds2',
    stepIds: new Set(stepIds),
    density: 1,
    motion: 'full',
    out,
  });
}

const batchDir = () => join(out, 'ios-simulator', 'rn', 'raised-light-portrait-full');
const readJson = (name) => JSON.parse(readFileSync(join(batchDir(), name), 'utf8'));

describe('runParitySlice --steps', () => {
  it('replays the steps before a named one unrecorded and stops after it', async () => {
    const fake = fakeDriver();

    const failed = await runDs2(['width-pick-size5'], fake);

    expect(failed).toEqual([]);
    expect(fake.taps).toEqual([
      'Expand controls',
      'Brushes',
      'Crayon',
      'Brushes',
      'Pen',
      'Stroke width',
      'Size 5',
    ]);
    expect(readJson('batch.json').steps.map(({ id, error }) => ({ id, error }))).toEqual([
      { id: 'width-pick-size5', error: null },
    ]);
    expect(existsSync(join(batchDir(), 'width-menu-open.json'))).toBe(false);
  });
});

describe('runParitySlice step errors', () => {
  it('fail the arm and the exit code while keeping the step’s evidence', async () => {
    const fake = fakeDriver({ failingTaps: { Brushes: FOREGROUND_ERROR } });

    const failed = await runDs2(['drawer-open', 'brush-menu-open'], fake);

    expect(failed).toEqual([{ arm: 'rn', error: `brush-menu-open: ${FOREGROUND_ERROR}` }]);
    expect(process.exitCode).toBe(1);
    expect(readJson('brush-menu-open.json').error).toBe(FOREGROUND_ERROR);
    expect(readJson('batch.json').steps.map(({ id, error }) => ({ id, error }))).toEqual([
      { id: 'drawer-open', error: null },
      { id: 'brush-menu-open', error: FOREGROUND_ERROR },
    ]);
  });
});
