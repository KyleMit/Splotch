import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  ERASER_WIDTH_STORAGE_KEY,
  createInterruptFence,
  driveEraserPasses,
  erasurePassProblem,
  inkPreparedProblem,
  passLiftProblem,
  strokeDelivery,
} from '../android/capture-bundled-frames.mjs';
import { STROKES_PER_GESTURE_REPEAT } from '../ios/capture-xcuitest-screen.mjs';
import { ERASER_CENSUS_GRID } from '../lib/eraser-fill.mjs';

const SAMPLES = ERASER_CENSUS_GRID * ERASER_CENSUS_GRID;
const TILES = 4;
const census = (opaque, erased = 0, backing = '270x403') => ({
  tiles: Array.from({ length: TILES }, () => ({ backing, samples: SAMPLES, opaque, erased })),
});
const inked = census(SAMPLES);

describe('eraser width provenance', () => {
  it('reads the same storage key the product persists the eraser size under', () => {
    const source = readFileSync(join(ROOT, 'web', 'src', 'lib', 'storageKeys.ts'), 'utf8');
    expect(/eraserWidthSize:\s*'([^']+)'/.exec(source)?.[1]).toBe(ERASER_WIDTH_STORAGE_KEY);
  });
});

describe('eraser ink verdicts', () => {
  it('accepts a fully inked paper and names every thin tile otherwise', () => {
    expect(inkPreparedProblem(inked, 1)).toBeNull();
    expect(inkPreparedProblem(census(0), 1)).toMatch(
      /before pass 1, the paper is not fully inked where the eraser will travel: tile 0 0\/4096/
    );
    expect(inkPreparedProblem({ error: 'no live tiles to sample' }, 2)).toMatch(/census failed/);
    expect(inkPreparedProblem({ tiles: [] }, 1)).toMatch(/no live tiles/);
  });

  it('accepts a pass that erased along the gesture', () => {
    expect(erasurePassProblem(inked, census(SAMPLES - 400, 300), 1)).toBeNull();
  });

  it('refuses a pass that removed no measurable ink', () => {
    expect(erasurePassProblem(inked, census(SAMPLES), 1)).toMatch(
      /erased 0 of 16384 census samples, under the 0.5% floor/
    );
  });

  it('refuses a cleared tile or a resized backing as something other than erasing', () => {
    const wiped = census(SAMPLES - 400, 300);
    wiped.tiles[2] = { backing: '270x403', samples: SAMPLES, opaque: 0, erased: SAMPLES };
    expect(erasurePassProblem(inked, wiped, 1)).toMatch(/tiles 2 with no ink at all/);
    expect(erasurePassProblem(inked, census(SAMPLES - 400, 300, '135x201'), 1)).toMatch(
      /changed tile backings .* a resize, not an erase/
    );
  });

  it('requires every delivered stroke to have ended, with no cancel', () => {
    expect(passLiftProblem({ downs: 16, ups: 16, cancels: 0 }, 1)).toBeNull();
    expect(passLiftProblem({ downs: 14, ups: 14, cancels: 0 }, 1)).toBeNull();
    expect(passLiftProblem({ downs: 16, ups: 15, cancels: 0 }, 1)).toMatch(
      /stroke still in contact: 16 pointerdowns, 15 pointerups/
    );
    expect(passLiftProblem({ downs: 16, ups: 16, cancels: 1 }, 1)).toMatch(/pointercancel/);
    expect(passLiftProblem({ downs: 0, ups: 0, cancels: 0 }, 1)).toMatch(
      /delivered no trusted canvas stroke/
    );
  });
});

// A page whose tiles, probe, and fill behave like the app's, driven by the
// same scripts the capture sends. `faults` breaks one step at a time.
function fakeDevice(faults = {}) {
  const log = [];
  const state = { inked: !faults.neverFilled, erasedThisPass: 0, events: [] };
  globalThis.window = {
    __probe: {
      counts: () => ({ events: state.events.length }),
      events: (from, count) => state.events.slice(from, from + count),
    },
  };
  globalThis.requestAnimationFrame = (callback) => callback();
  const page = {
    evaluate: async (script, arg) => {
      if (typeof script === 'function') {
        if (script.toString().includes('requestAnimationFrame')) log.push('idle');
        return script(arg);
      }
      if (script.includes('eraserInkCensus()')) {
        log.push('census');
        if (!state.inked) return census(0);
        return state.erasedThisPass
          ? census(SAMPLES - state.erasedThisPass, state.erasedThisPass)
          : inked;
      }
      if (script.includes('fillEraserInk(false)')) {
        log.push('refill');
        if (faults.refillPaintsNothing) {
          state.inked = false;
          return { tiles: TILES, backings: [], transparentTiles: [0, 1, 2, 3] };
        }
        state.inked = true;
        state.erasedThisPass = 0;
        return { tiles: TILES, backings: [], transparentTiles: [] };
      }
      throw new Error(`unexpected script ${script.slice(0, 60)}`);
    },
  };
  const dispatchSwipe = () => {
    if (log.at(-1) !== 'swipes') log.push('swipes');
    if (faults.noInput) return;
    // trusted (8) on-canvas (6) down (type 0) then up (type 2)
    state.events.push([0, 0, 0, 1, 1, 0, 1, 0, 1], [0, 0, 2, 1, 0, 0, 1, 0, 1]);
    if (!faults.erasesNothing && state.inked) state.erasedThisPass += 60;
  };
  return { page, dispatchSwipe, log };
}

describe('stroke delivery record', () => {
  it('counts trusted on-canvas downs against the planned swipes', () => {
    const down = [0, 0, 0, 1, 1, 0, 1, 0, 1];
    const offCanvas = [0, 0, 0, 1, 1, 0, 0, 0, 1];
    const untrusted = [0, 0, 0, 1, 1, 0, 1, 0, 0];
    const up = [0, 0, 2, 1, 0, 0, 1, 0, 1];
    const geometry = { canvas: { x: 0, y: 108, width: 360, height: 672 }, dpr: 3 };

    expect(strokeDelivery([down, up, down, up, offCanvas, untrusted], geometry, 2)).toEqual({
      planned: 32,
      delivered: 2,
    });
  });
});

describe('driving eraser passes', () => {
  const canvas = { x: 0, y: 108, width: 360, height: 672 };
  let fence;
  beforeEach(() => {
    vi.useFakeTimers();
    fence = createInterruptFence({
      exit: () => {},
      warn: () => {},
      pause: async (ms) => {
        vi.advanceTimersByTime(ms);
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
  });
  const drive = (device, repeats = 3) =>
    driveEraserPasses({
      page: device.page,
      fence,
      repeats,
      canvas,
      dpr: 3,
      dispatchSwipe: device.dispatchSwipe,
    });

  it('proves ink, strokes, and erasure for every pass and refills between them', async () => {
    const device = fakeDevice();

    const { passes, refills } = await drive(device);

    expect(device.log).toEqual([
      ...['census', 'idle', 'swipes', 'census', 'refill'],
      ...['census', 'idle', 'swipes', 'census', 'refill'],
      ...['census', 'idle', 'swipes', 'census'],
    ]);
    expect(passes.every((pass) => pass.plannedStrokes === 16)).toBe(true);
    expect(passes.map((pass) => [pass.pass, pass.lifts.ups, pass.after.erased])).toEqual([
      [1, 16, 16 * 60 * TILES],
      [2, 16, 16 * 60 * TILES],
      [3, 16, 16 * 60 * TILES],
    ]);
    expect(refills).toEqual([
      {
        afterStroke: STROKES_PER_GESTURE_REPEAT,
        pending: false,
        transparentTiles: [],
        trustedCanvasPointerUps: 16,
        at: null,
      },
      {
        afterStroke: 2 * STROKES_PER_GESTURE_REPEAT,
        pending: false,
        transparentTiles: [],
        trustedCanvasPointerUps: 32,
        at: null,
      },
    ]);
  });

  it('records no refill for a single pass', async () => {
    const { refills, passes } = await drive(fakeDevice(), 1);

    expect(passes).toHaveLength(1);
    expect(refills).toEqual([]);
  });

  it('refuses blank preparation before any stroke is sent', async () => {
    const device = fakeDevice({ neverFilled: true });

    await expect(drive(device)).rejects.toThrow(/before pass 1, the paper is not fully inked/);
    expect(device.log).toEqual(['census']);
  });

  it('refuses a refill that painted nothing', async () => {
    await expect(drive(fakeDevice({ refillPaintsNothing: true }))).rejects.toThrow(
      /the eraser refill after pass 1 failed/
    );
  });

  it('refuses a pass whose strokes removed no ink', async () => {
    await expect(drive(fakeDevice({ erasesNothing: true }))).rejects.toThrow(
      /pass 1 erased 0 of 16384 census samples/
    );
  });

  it('refuses a pass whose strokes never reached the canvas', async () => {
    await expect(drive(fakeDevice({ noInput: true }))).rejects.toThrow(
      /pass 1 delivered no trusted canvas stroke to the page/
    );
  });
});
