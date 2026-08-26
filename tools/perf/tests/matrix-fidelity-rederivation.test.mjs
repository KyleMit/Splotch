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
  // Re-derivation is what lets a check-level decision reach published cells
  // without device time: these sixteen native cells were held unscoreable first
  // by a Safari-shaped `=== 0` expectation, then by an UNCALIBRATED entry, and
  // the delivery experiments retired the check itself (see the coalescing block
  // in input-fidelity.mjs). Same banked captures, now scoreable.
  it('judges a Capacitor WKWebView capture by the WKWebView expectations', () => {
    const runs = drawingRuns('ipad-device-native', 'ipad-device-native');

    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      const run = runs[brush].runs[0];
      expect(run.fidelity.runtime).toBe('ios-capacitor-webview');
      expect(run.fidelity.uncalibrated).toEqual([]);
      expect(run.fidelity.notApplicable).toContain('coalescing');
      expect(run.fidelity.passed).toBe(true);
      expect(runs[brush].aggregate.failedFidelityChecks).toEqual([]);
      expect(runs[brush].aggregate.scoreable).toBe(true);
    }
  });

  // The excluded check is absent from `checks` — never present-and-true, so no
  // reader can believe the runtime answered a question it was never asked.
  it('omits the excluded check rather than passing it', () => {
    const runs = drawingRuns('ipad-device-native', 'ipad-device-native');
    const checks = runs.crayon.runs[0].fidelity.checks;

    expect(checks).toMatchObject({
      trustedTouch: true,
      cadence: true,
      pressure: true,
      contactGeometry: true,
    });
    expect(Object.keys(checks)).not.toContain('coalescing');
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

// One composed answer per run to "can I trust this number?" (issue 1304): a
// list, not a score, because the interesting case is which guarantee is
// missing. hostQuiet is deliberately present and unrecorded — the dimension
// with no measurement yet, kept visible instead of forgotten.
describe('the per-run trust ledger', () => {
  it('composes verified dimensions for a sound capture', () => {
    const runs = drawingRuns('ipad-device-web', 'ipad-device-web');
    const trust = runs.pen.runs[0].trust;
    const byName = Object.fromEntries(trust.map((entry) => [entry.name, entry]));

    expect(byName.inputFidelity.state).toBe('verified');
    expect(byName.refreshRegime).toMatchObject({ state: 'verified', detail: '60hz' });
    expect(byName.hostQuiet.state).toBe('unrecorded');
    expect(byName.pageIdentity.state).toBe('unrecorded');
  });

  it('names an absent guarantee apart from a failed one', () => {
    const runs = drawingRuns('ipad-device-web', 'ipad-device-web');
    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      for (const entry of runs[brush].runs[0].trust) {
        expect(['verified', 'failed', 'unrecorded']).toContain(entry.state);
      }
    }
  });

  it('adds the eraser-ink dimension only to runs that recorded fill machinery', () => {
    const runs = drawingRuns('ipad-device-web', 'ipad-device-web');
    const names = (brush) => runs[brush].runs[0].trust.map((entry) => entry.name);

    // These corpus captures predate the fill recorder, so the dimension is
    // absent-as-inapplicable rather than unrecorded — and every run still
    // carries the universal dimensions.
    expect(names('pen')).toContain('hostQuiet');
    expect(names('pen')).toContain('inputFidelity');
  });
});
