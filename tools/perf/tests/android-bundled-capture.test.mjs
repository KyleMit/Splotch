import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_OWNS_ROTATION } from '../lib/campaign-state.mjs';
import {
  createInterruptFence,
  establishRequestedOrientation,
  geometryChangesProblem,
  geometryDriftProblem,
  observedOrientation,
  orientationProblem,
  restoreCaptureState,
} from '../android/capture-bundled-frames.mjs';

const portrait = {
  viewport: { width: 360, height: 780 },
  canvas: { x: 0, y: 108, width: 360, height: 672 },
  dpr: 3,
  screenOrientation: 'portrait-primary',
};
const landscape = {
  viewport: { width: 780, height: 360 },
  canvas: { x: 0, y: 108, width: 780, height: 252 },
  dpr: 3,
  screenOrientation: 'landscape-primary',
};

describe('observed page orientation', () => {
  it('reads the orientation from the page viewport, not from the request', () => {
    expect(observedOrientation(portrait)).toBe('PORTRAIT');
    expect(observedOrientation(landscape)).toBe('LANDSCAPE');
  });

  it.each([
    ['a square viewport', { viewport: { width: 500, height: 500 } }],
    ['a zero viewport', { viewport: { width: 0, height: 780 } }],
    ['a missing viewport', {}],
    ['no geometry at all', null],
  ])('cannot name an orientation from %s', (_name, geometry) => {
    expect(observedOrientation(geometry)).toBeNull();
  });

  it('refuses a LANDSCAPE request that the page measured in portrait', () => {
    expect(orientationProblem('LANDSCAPE', portrait)).toBe(
      'the page is PORTRAIT at 360x780, not the requested LANDSCAPE'
    );
    expect(orientationProblem('PORTRAIT', portrait)).toBeNull();
    expect(orientationProblem('LANDSCAPE', landscape)).toBeNull();
  });

  it('refuses geometry that cannot prove an orientation or has no sized canvas', () => {
    expect(orientationProblem('PORTRAIT', { viewport: { width: 400, height: 400 } })).toMatch(
      /cannot prove its orientation/
    );
    expect(orientationProblem('PORTRAIT', { ...portrait, canvas: null })).toMatch(
      /no sized #drawingCanvas/
    );
  });
});

describe('geometry stability across the capture', () => {
  it('accepts identical snapshots', () => {
    expect(geometryDriftProblem(portrait, structuredClone(portrait))).toBeNull();
  });

  it('names every figure that moved', () => {
    expect(geometryDriftProblem(portrait, landscape)).toMatch(
      /viewport width 360 -> 780, viewport height 780 -> 360, canvas width 360 -> 780/
    );
  });

  it('refuses a snapshot missing a figure rather than treating absence as agreement', () => {
    expect(geometryDriftProblem(portrait, { ...portrait, dpr: undefined })).toMatch(
      /devicePixelRatio 3 -> undefined/
    );
  });

  it('refuses a capture the page saw resize, even if the endpoints agree', () => {
    expect(geometryChangesProblem([])).toBeNull();
    expect(geometryChangesProblem([{ kind: 'resize', at: 1, width: 780, height: 360 }])).toMatch(
      /resized or rotated 1 time/
    );
    expect(geometryChangesProblem(null)).toMatch(/lost its geometry-change record/);
  });
});

describe('establishing the requested orientation', () => {
  const noWait = async () => {};

  it('leaves the app lock alone when the page already matches', async () => {
    const releaseLock = vi.fn();

    const result = await establishRequestedOrientation({
      orientation: 'PORTRAIT',
      readGeometry: async () => portrait,
      releaseLock,
      wait: noWait,
    });

    expect(releaseLock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ settled: portrait, lockReleased: false });
  });

  it('releases the app lock, then re-asserts the rotation the display must follow', async () => {
    const calls = [];
    let turned = false;
    const result = await establishRequestedOrientation({
      orientation: 'LANDSCAPE',
      readGeometry: async () => (turned ? landscape : portrait),
      releaseLock: async () => {
        calls.push('release');
        return { lockedOrientation: 'portrait' };
      },
      reassertRotation: async () => {
        calls.push('reassert');
        turned = calls[0] === 'release';
      },
      wait: noWait,
    });

    expect(calls).toEqual(['release', 'reassert']);
    expect(result).toEqual({ launched: portrait, settled: landscape, lockReleased: true });
  });

  it('fails loudly when the page still disagrees after the lock is released', async () => {
    await expect(
      establishRequestedOrientation({
        orientation: 'LANDSCAPE',
        readGeometry: async () => portrait,
        releaseLock: async () => ({ lockedOrientation: 'portrait' }),
        reassertRotation: async () => {},
        wait: noWait,
        followTimeoutMs: 0,
      })
    ).rejects.toThrow(
      /the page is PORTRAIT at 360x780, not the requested LANDSCAPE — after releasing the app's rotation lock/
    );
  });

  it('says when there was no app lock to blame', async () => {
    await expect(
      establishRequestedOrientation({
        orientation: 'LANDSCAPE',
        readGeometry: async () => portrait,
        releaseLock: async () => PLATFORM_OWNS_ROTATION,
        reassertRotation: async () => {},
        wait: noWait,
        followTimeoutMs: 0,
      })
    ).rejects.toThrow(/the platform owns rotation/);
  });

  it('does not report a release when the lock was already off', async () => {
    let released = false;
    const result = await establishRequestedOrientation({
      orientation: 'LANDSCAPE',
      readGeometry: async () => (released ? landscape : portrait),
      releaseLock: async () => {
        released = true;
        return { lockedOrientation: null };
      },
      reassertRotation: async () => {},
      wait: noWait,
    });

    expect(result.lockReleased).toBe(false);
  });
});

describe('capture cleanup', () => {
  const previousRotation = { accelerometer_rotation: '1', user_rotation: '0' };

  it('restores the app lock first, then every adb setting, each independently', async () => {
    const calls = [];
    const state = {
      lockToRestore: { lockedOrientation: 'portrait' },
      execute: async () => {
        calls.push('lock');
        throw new Error('Settings did not open');
      },
      browser: { close: async () => calls.push('close') },
      forwarded: true,
    };
    const adb = (_serial, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'forward') throw new Error('no forward');
    };

    const steps = await restoreCaptureState({
      serial: 'SERIAL',
      forwardPort: 9226,
      previousRotation,
      state,
      adb,
    });

    expect(calls[0]).toBe('lock');
    expect(calls.slice(1)).toEqual([
      'close',
      'forward --remove tcp:9226',
      'shell settings put system accelerometer_rotation 1',
      'shell settings put system user_rotation 0',
    ]);
    expect(steps.filter((step) => !step.ok).map((step) => step.step)).toEqual([
      'app rotation lock restore',
      'forward removal',
    ]);
  });

  it('touches no app lock it did not release', async () => {
    const execute = vi.fn();
    const steps = await restoreCaptureState({
      serial: 'SERIAL',
      forwardPort: 9226,
      previousRotation,
      state: { lockToRestore: null, execute, browser: null, forwarded: false },
      adb: () => {},
    });

    expect(execute).not.toHaveBeenCalled();
    expect(steps.map((step) => step.step)).toEqual([
      'rotation restore (accelerometer_rotation 1)',
      'rotation restore (user_rotation 0)',
    ]);
  });
});

describe('interrupt fence', () => {
  it('defers the first signal to the next checkpoint and exits only after cleanup', () => {
    const exit = vi.fn();
    const fence = createInterruptFence({ exit, warn: () => {} });

    expect(() => fence.checkpoint()).not.toThrow();
    fence.onSignal(130);
    expect(exit).not.toHaveBeenCalled();
    expect(() => fence.checkpoint()).toThrow(/interrupted/);

    fence.exitIfInterrupted();
    expect(exit).toHaveBeenCalledWith(130);
  });

  it('lets a second signal exit at once', () => {
    const exit = vi.fn();
    const fence = createInterruptFence({ exit, warn: () => {} });

    fence.onSignal(130);
    fence.onSignal(143);

    expect(exit).toHaveBeenCalledWith(143);
  });

  it('does not exit an uninterrupted run', () => {
    const exit = vi.fn();
    createInterruptFence({ exit, warn: () => {} }).exitIfInterrupted();

    expect(exit).not.toHaveBeenCalled();
  });
});
