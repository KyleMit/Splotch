import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { normalizeMatrix } from '../gen-performance-matrix.mjs';

// The tracked corpus holds one real capture per target and brush (ADR-0138), all
// four of these taken LANDSCAPE-dark, so a one-mode manifest over them exercises the
// real normalize path against real artifacts rather than a hand-built profile.
const CORPUS = 'perf-profiles/evidence/2026-08-23-ipad-main';

function manifestFor(targetId, prefix) {
  return {
    schemaVersion: 3,
    recordedOn: '2026-08-23',
    productCommit: '0000000000000000000000000000000000000000',
    snapshotKind: 'test',
    architecture: 'test',
    sourceRoot: CORPUS,
    targets: [
      {
        id: targetId,
        label: targetId,
        fidelity: 'advisory',
        modes: [
          ...[
            { id: 'portrait-light', orientation: 'PORTRAIT', theme: 'light' },
            { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
            { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
          ].map((spec) => ({
            ...spec,
            status: 'unavailable',
            reason: 'only the tracked landscape-dark sample is exercised here',
          })),
          {
            id: 'landscape-dark',
            status: 'captured',
            orientation: 'LANDSCAPE',
            theme: 'dark',
            drawing: Object.fromEntries(
              ['pen', 'crayon', 'magic', 'eraser'].map((brush) => [
                brush,
                [`${prefix}-${brush}.json`],
              ])
            ),
          },
        ],
      },
    ],
  };
}

function drawingRuns(targetId, prefix) {
  const matrix = normalizeMatrix(manifestFor(targetId, prefix), ROOT);
  return matrix.targets[0].modes.find((mode) => mode.id === 'landscape-dark').drawing;
}

describe('a matrix cell re-derives its input-fidelity verdict', () => {
  // The matrix already re-scores every drawing table with the current gates, on the
  // grounds that a frozen number describes a superseded metric. The fidelity verdict
  // was the one thing left frozen, so a correction to the expectations reached
  // published cells only through device time.
  it('judges a Capacitor WKWebView capture by the WKWebView expectations', () => {
    const runs = drawingRuns('ipad-device-native', 'ipad-device-native');

    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      const run = runs[brush].runs[0];
      // The verdict recorded at capture time failed on `coalescing`, because the
      // expectation in force then described Safari (ADR-0139).
      expect(run.fidelity.runtime).toBe('ios-capacitor-webview');
      expect(run.fidelity.passed).toBe(true);
      expect(runs[brush].aggregate.failedFidelityChecks).toEqual([]);
      expect(runs[brush].aggregate.scoreable).toBe(true);
    }
  });

  // Making the target scoreable is not the same as making it pass, and the point of
  // re-deriving is that a real cost stops hiding behind an unscoreable label: native
  // crayon is roughly twice Safari's on the same device (#1236).
  it('lets a real native cost render as a failure instead of as unscoreable', () => {
    const runs = drawingRuns('ipad-device-native', 'ipad-device-native');

    expect(runs.crayon.aggregate.lostFrameTimeShare).toBeGreaterThan(runs.crayon.gateShare);
    expect(runs.crayon.aggregate.blankPassed).toBe(false);
    expect(runs.pen.aggregate.blankPassed).toBe(true);
  });

  it('leaves a Safari capture passing, judged by Safari expectations', () => {
    const runs = drawingRuns('ipad-device-web', 'ipad-device-web');

    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      expect(runs[brush].runs[0].fidelity).toMatchObject({
        runtime: 'ios-safari',
        passed: true,
      });
      expect(runs[brush].aggregate.scoreable).toBe(true);
    }
  });

  // Every one of these captures reports a 17 ms beat, which is the regime both iPad
  // targets are scored against.
  it('records the refresh regime each run was measured in', () => {
    const runs = drawingRuns('ipad-device-web', 'ipad-device-web');

    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      expect(runs[brush].runs[0].refreshRegime).toMatchObject({
        observed: '60hz',
        expected: '60hz',
        matched: true,
      });
    }
    expect(runs.pen.aggregate.refreshRegime).toBe('60hz');
    expect(runs.pen.aggregate.offRefreshRegime).toBe(false);
  });
});
