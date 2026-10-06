// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMagicWorkCounters } from '../../../web/src/lib/drawing/magicWorkDebug.ts';
import { summarizeActionGroup } from '../lib/action-stats.mjs';
import { ACTION_PROBE, installVsyncClock } from './fixtures/action-probe-fixture.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  delete window.__actionProbe;
  delete window.__drawingDebug;
  performance.clearMeasures();
  performance.clearMarks();
});

function magicSnapshot() {
  return {
    magicWitnessRevision: 1,
    magicEngineFacts: { brush: 'pen', engineLive: true, paperSized: true },
    magicBrushState: {
      magicSourceKind: 'none',
      magicPoolExists: false,
      magicHeldGradient: false,
      magicSheetReady: false,
      magicSheetGeometryStale: false,
      magicPendingLoad: false,
      magicPendingFillRaster: false,
      magicPendingGradientRaster: false,
      magicDeferredFill: false,
      magicFillUrl: null,
      magicSheetSourceUrl: null,
      magicPaperSize: { width: 400, height: 300 },
      magicSheetBounds: { x: -10, y: -5, width: 420, height: 310 },
      magicSheetOrigin: { x: -10, y: -5 },
    },
    magicWorkerState: {
      magicWorkerSupported: true,
      magicWorkerExists: false,
      magicWorkerPending: 0,
      magicWorkerNextRequestId: 0,
    },
    magicWorkCounts: createMagicWorkCounters().snapshot(),
  };
}

function armMagicProbe(clock, kind = 'external') {
  Function(ACTION_PROBE)();
  clock.tick();
  clock.tick();
  const button = document.createElement('button');
  button.id = 'magic-action';
  document.body.append(button);
  if (kind === 'external') window.__actionProbe.beginExternal('magic action', ['resize']);
  else window.__actionProbe.begin('magic action', '#magic-action', ['click']);
  clock.at(40);
  if (kind === 'external') window.__actionProbe.markExternalAction();
  else button.click();
}

describe('contained Magic action witnesses', () => {
  it.each(['external', 'target'])(
    'contains a throwing before reader in the %s begin path',
    (kind) => {
      const clock = installVsyncClock();
      window.__drawingDebug = {
        getMagicWorkDebug: vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('Before failed');
          })
          .mockImplementation(magicSnapshot),
      };
      armMagicProbe(clock, kind);
      clock.tick();
      clock.at(80);
      const sample = window.__actionProbe.finish();
      expect(sample.magicWork.before).toMatchObject({
        available: false,
        reason: 'read-failed',
        error: 'Before failed',
      });
      expect(sample.magicWork.after.available).toBe(true);
      expect(sample.magicWork.comparison).toEqual({ available: false, reason: 'unavailable-read' });
      expect(sample).toMatchObject({ label: 'magic action', actionAt: 40, readyMs: 40 });
    }
  );

  it('contains a throwing finish reader without discarding failed activation evidence', () => {
    const clock = installVsyncClock();
    window.__drawingDebug = {
      getMagicWorkDebug: vi
        .fn()
        .mockImplementationOnce(magicSnapshot)
        .mockImplementation(() => {
          throw new Error('After failed');
        }),
    };
    Function(ACTION_PROBE)();
    window.__actionProbe.beginExternal('uncaptured action', ['resize']);
    clock.at(80);
    const sample = window.__actionProbe.finish();
    expect(sample.magicWork.after).toMatchObject({
      available: false,
      reason: 'read-failed',
      error: 'After failed',
    });
    expect(sample).toMatchObject({
      label: 'uncaptured action',
      eventType: 'uncaptured',
      trusted: null,
    });
    expect(sample.measures.map(({ name }) => name)).toContain(sample.traceName);
  });

  it('contains lookup and error-formatting failures', () => {
    const clock = installVsyncClock();
    const unprintable = {
      get message() {
        throw new Error('Cannot format');
      },
    };
    Object.defineProperty(window, '__drawingDebug', {
      configurable: true,
      get() {
        throw unprintable;
      },
    });
    armMagicProbe(clock);
    clock.at(80);
    expect(window.__actionProbe.finish().magicWork.after).toMatchObject({
      available: false,
      reason: 'read-failed',
      error: 'Magic witness error could not be formatted',
    });
  });

  it.each([
    ['missing', undefined],
    ['disabled', () => null],
    ['read-failed', () => ({ magicWitnessRevision: 1 })],
    [
      'read-failed',
      () => {
        const value = magicSnapshot();
        value.magicWorkCounts.magicPoolBuilds = -1;
        return value;
      },
    ],
    [
      'read-failed',
      () => {
        const value = magicSnapshot();
        value.magicBrushState.magicSheetOrigin.x = Infinity;
        return value;
      },
    ],
    [
      'read-failed',
      () => {
        const value = magicSnapshot();
        value.magicEngineFacts.brush = 'marker';
        return value;
      },
    ],
  ])('keeps %s witness state unavailable instead of fabricating zero work', (reason, reader) => {
    const clock = installVsyncClock();
    window.__drawingDebug = { getMagicWorkDebug: reader };
    armMagicProbe(clock);
    clock.at(80);
    const result = window.__actionProbe.finish();
    expect(result.magicWork.before).toMatchObject({ available: false, reason });
    expect(result.magicWork.comparison).not.toHaveProperty('deltas');
  });

  it('copies available snapshots and reports nonmonotonic module work', () => {
    const clock = installVsyncClock();
    const value = magicSnapshot();
    value.magicWorkCounts.magicPoolBuilds = 1;
    window.__drawingDebug = { getMagicWorkDebug: () => value };
    armMagicProbe(clock);
    value.magicWorkCounts.magicPoolBuilds = 0;
    clock.at(80);
    const result = window.__actionProbe.finish();
    expect(result.magicWork.before.snapshot.magicWorkCounts.magicPoolBuilds).toBe(1);
    expect(result.magicWork.after.snapshot.magicWorkCounts.magicPoolBuilds).toBe(0);
    expect(result.magicWork.comparison).toMatchObject({ available: false, reason: 'nonmonotonic' });
  });

  it('rejects deltas after the reader lifetime changes and never serializes the reader', () => {
    const clock = installVsyncClock();
    window.__drawingDebug = { getMagicWorkDebug: magicSnapshot };
    armMagicProbe(clock);
    window.__drawingDebug.getMagicWorkDebug = () => magicSnapshot();
    clock.at(80);
    const result = window.__actionProbe.finish();
    expect(result.magicWork.comparison).toEqual({
      available: false,
      reason: 'module-lifetime-changed',
    });
    expect(JSON.parse(JSON.stringify(result.magicWork)).before).not.toHaveProperty('reader');
  });

  it('returns copied monotonic deltas only within the same reader lifetime and time origin', () => {
    const clock = installVsyncClock();
    const value = magicSnapshot();
    window.__drawingDebug = { getMagicWorkDebug: () => value };
    armMagicProbe(clock);
    value.magicWorkCounts.magicInitialPosts = 2;
    value.magicWorkCounts.magicRecodes['apply-fill'].magicRecodeChanges = 1;
    value.magicBrushState.magicSheetOrigin.x = 90;
    clock.at(80);
    const result = window.__actionProbe.finish();
    expect(result.magicWork.comparison).toMatchObject({
      available: true,
      deltas: {
        magicInitialPosts: 2,
        magicRecodes: { 'apply-fill': { magicRecodeChanges: 1 } },
      },
    });
    expect(result.magicWork.before.snapshot.magicBrushState.magicSheetOrigin.x).toBe(-10);
    expect(result.magicWork.after.snapshot.magicBrushState.magicSheetOrigin.x).toBe(90);
    expect(result.magicWork.before).toMatchObject({ startedAt: 33.4, finishedAt: 33.4 });
  });

  it('freezes finish clocks, frames and the action measure slice before the after reader', () => {
    const clock = installVsyncClock();
    window.__drawingDebug = {
      getMagicWorkDebug: vi
        .fn()
        .mockImplementationOnce(magicSnapshot)
        .mockImplementation(() => {
          clock.at(500);
          performance.measure('engine.commit', { start: 200, duration: 100 });
          performance.measure('magicWitness.recode', { start: 201, duration: 99 });
          return magicSnapshot();
        }),
    };
    armMagicProbe(clock);
    clock.tick();
    clock.at(80);
    const sample = window.__actionProbe.finish();
    expect(sample.readyMs).toBe(40);
    expect(sample.measures.map(({ name }) => name)).toEqual([sample.traceName]);
    expect(sample.magicMeasures).toEqual([]);
    expect(sample.magicWork.after.finishedAt).toBe(500);
  });

  it('refuses cross-origin and malformed-clock witness comparisons', () => {
    const clock = installVsyncClock();
    const origin = vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1000);
    window.__drawingDebug = { getMagicWorkDebug: magicSnapshot };
    armMagicProbe(clock);
    origin.mockReturnValue(2000);
    clock.at(80);
    expect(window.__actionProbe.finish().magicWork.comparison).toEqual({
      available: false,
      reason: 'time-origin-changed',
    });
    armMagicProbe(clock);
    origin.mockReturnValue(Infinity);
    clock.at(80);
    expect(window.__actionProbe.finish().magicWork.after).toMatchObject({
      available: false,
      reason: 'read-failed',
      error: 'Invalid Magic witness read clock',
    });
  });

  it('retains late known and unknown diagnostic spans without changing scored activity', () => {
    const clock = installVsyncClock();
    armMagicProbe(clock);
    for (let tick = 0; tick < 10; tick++) clock.tick();
    performance.measure('engine.draw', { start: 41, duration: 2 });
    performance.measure('magicWitness.ensure', { start: 140, duration: 20 });
    performance.measure('magicWitness.unexpected', { start: 161, duration: 2 });
    clock.at(210);
    const result = window.__actionProbe.finish(60);
    const baseline = {
      ...result,
      measures: result.measures.filter(({ name }) => !name.startsWith('magicWitness.')),
    };
    expect(result.magicMeasures).toEqual([
      { name: 'magicWitness.ensure', startFromActionMs: 100, duration: 20 },
      { name: 'magicWitness.unexpected', startFromActionMs: 121, duration: 2 },
    ]);
    expect(result.magicMeasureProblems).toEqual(['magicWitness.unexpected']);
    expect(result.measures.some(({ name }) => name.startsWith('magicWitness.'))).toBe(false);
    expect(summarizeActionGroup([result])).toEqual(summarizeActionGroup([baseline]));
    expect(
      summarizeActionGroup([
        {
          ...baseline,
          measures: [
            ...baseline.measures,
            { name: 'engine.commit', startFromActionMs: 100, duration: 20 },
          ],
        },
      ]).frameSamples.scored
    ).toBeGreaterThan(summarizeActionGroup([baseline]).frameSamples.scored);
  });
});
