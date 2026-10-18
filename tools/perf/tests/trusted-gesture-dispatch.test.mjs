import { describe, expect, it, vi } from 'vitest';
import {
  dispatchTrustedGestureStrokes,
  trustedGestureActions,
} from '../lib/trusted-gesture-plan.mjs';

const BOUNDS = { x: 100, y: 100, width: 800, height: 600 };
const STROKES = 10;
const REPEAT_PAUSE_MS = 2000;

describe('WDA stroke request boundaries', () => {
  it('prevents a request-coalescing driver from joining ten strokes into one', async () => {
    const plan = trustedGestureActions(BOUNDS);
    const joined = [];
    const wda = async (sources) => {
      const down = sources[0].actions.find((action) => action.type === 'pointerDown');
      if (down) joined.push(down);
    };
    await wda([{ actions: plan }]);
    expect(joined).toHaveLength(1);
    joined.length = 0;
    await expect(dispatchTrustedGestureStrokes(plan, wda)).resolves.toBe(STROKES);
    expect(joined).toHaveLength(STROKES);
  });

  it('preserves the complete measured gesture and pauses across repeated passes', async () => {
    const plan = trustedGestureActions(BOUNDS, 2, REPEAT_PAUSE_MS);
    const requests = [];
    await dispatchTrustedGestureStrokes(plan, async (sources) => requests.push(sources));
    expect(requests).toHaveLength(STROKES * 2);
    expect(requests.flatMap(([source]) => source.actions)).toEqual(plan);
    expect(
      requests.map(([source]) => source.actions.filter((a) => a.type === 'pointerDown').length)
    ).toEqual(Array(STROKES * 2).fill(1));
    expect(
      requests.map(([source]) => source.actions.filter((a) => a.type === 'pointerUp').length)
    ).toEqual(Array(STROKES * 2).fill(1));
  });

  it('waits for each request and stops after an ambiguous delivery failure', async () => {
    const perform = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('delivery unknown'));
    await expect(
      dispatchTrustedGestureStrokes(trustedGestureActions(BOUNDS), perform)
    ).rejects.toThrow('delivery unknown');
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['held', [{ type: 'pointerDown' }]],
    ['unmatched release', [{ type: 'pointerUp' }]],
    ['nested contact', [{ type: 'pointerDown' }, { type: 'pointerDown' }, { type: 'pointerUp' }]],
    ['unfinished tail', [...trustedGestureActions(BOUNDS), { type: 'pointerMove', x: 1, y: 1 }]],
  ])('validates a %s plan before dispatching any input', async (_, actions) => {
    const perform = vi.fn();
    await expect(dispatchTrustedGestureStrokes(actions, perform)).rejects.toThrow();
    expect(perform).not.toHaveBeenCalled();
  });
});

describe('capture delivery admission', () => {
  it('records the actual iOS dispatch count and refuses joined or extra delivered contacts', async () => {
    const { iosDriver, captureRefusal } =
      await import('../split-capture/capture-device-frames.mjs');
    const { EVENT_TYPE, EVENT_TRUSTED, POINTER_DOWN } =
      await import('../lib/real-screen-stats.mjs');
    const report = { events: [] };
    const driver = iosDriver({
      request: async (_method, _path, body) => {
        const row = [];
        row[EVENT_TYPE] = POINTER_DOWN;
        row[EVENT_TRUSTED] = 1;
        report.events.push(row);
        return body;
      },
    });
    await driver.dispatch({ bounds: BOUNDS }, 1);
    expect(driver.dispatchedStrokes).toBe(STROKES);
    const artifact = {
      dispatchedStrokes: driver.dispatchedStrokes,
      report,
      fidelity: { passed: true },
    };
    expect(captureRefusal(artifact)).toBeNull();
    expect(
      captureRefusal({ ...artifact, report: { events: report.events.slice(0, 1) } })
    ).toContain('1 pointerdowns for 10 dispatched strokes');
    expect(
      captureRefusal({ ...artifact, report: { events: [...report.events, report.events[0]] } })
    ).toContain('11 pointerdowns for 10 dispatched strokes');
  });
});
