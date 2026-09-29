// The app's undo depth cap, restated in the iPad gates probe, a console snippet
// that cannot import it. A copy that falls behind the cap stops filling the
// stack, so the oldest-entry fold + shift overflow path the gates exist to time
// quietly stops running, and every number still looks plausible. The probe is
// run, not read: what matters is how many strokes each scenario draws.
//
// paced-crayon-session.js restates the same counts on purpose and is left out:
// it is the ADR-0173 release workload, held byte for byte to the 2026-09-18
// baseline by commit-contract.test.mjs, so it must not follow the cap.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { MAX_UNDO_DEPTH } from '../../../web/src/lib/drawing/undoHistory.ts';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// Only the stroke count is under test, so each stroke is kept to a few points.
const OPS_PER_STROKE = 4;

// A stand-in engine whose history holds MAX_UNDO_DEPTH entries, recording each
// run of strokes drawn between undos and whether one landed on a full stack.
async function runGatesProbeByDefault() {
  let clock = 0;
  let depth = 0;
  let measures = [];
  let run = { strokes: 0, overflowed: false };
  const runs = [];
  const measure = (name) => measures.push({ name, startTime: ++clock, duration: 1 });
  const draw = () => {
    if (depth === MAX_UNDO_DEPTH) run.overflowed = true;
    depth = Math.min(depth + 1, MAX_UNDO_DEPTH);
    run.strokes++;
    measure('engine.commit');
  };
  const undo = () => {
    if (run.strokes) runs.push(run);
    run = { strokes: 0, overflowed: false };
    depth--;
    measure('engine.undo');
  };
  const window = {
    innerWidth: 1024,
    innerHeight: 1366,
    devicePixelRatio: 2,
    __perfOps: OPS_PER_STROKE,
    __engineState: {
      get canUndo() {
        return depth > 0;
      },
    },
    __engine: {
      resizeTo() {},
      isCanvasEmpty: () => true,
      strokeSync: draw,
      multiStrokeSync: draw,
      undo,
      getUndoDebug: () => ({ snapshots: depth, historyLength: depth }),
    },
  };
  await runInNewContext(read('tools/perf/probes/engine-gates.js'), {
    window,
    console: { log() {}, table() {}, warn() {}, error() {} },
    requestAnimationFrame: (callback) => callback(++clock),
    setTimeout: (callback) => callback(),
    performance: {
      now: () => ++clock,
      getEntriesByType: () => measures,
      getEntriesByName: (name) => measures.filter((entry) => entry.name === name),
      clearMeasures: () => {
        measures = [];
      },
      clearMarks() {},
    },
  });
  // The first run is the single PERF_MARKS preflight stroke.
  const [preflight, ...scenarios] = runs;
  return { preflight, scenarios, rows: window.__perfRows };
}

describe('the undo depth the iPad gates probe restates', () => {
  // The desktop harness drives the same scenarios, and history-settle-deadline
  // already pins its depth copy; the probe overshoots the cap by what it does.
  const harnessOvershoot = Number(
    read('tools/perf/web/run-undo-scenarios.mjs').match(
      /const DEFAULT_SCENARIO_STROKES = MAX_UNDO_DEPTH \+ (\d+);/
    )?.[1]
  );

  it('draws every default scenario past the app cap by the harness overshoot', async () => {
    expect(harnessOvershoot).toBeGreaterThan(0);
    const { preflight, scenarios, rows } = await runGatesProbeByDefault();

    expect(preflight.strokes).toBe(1);
    expect(rows).toHaveLength(scenarios.length);
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      expect(scenario).toEqual({ strokes: MAX_UNDO_DEPTH + harnessOvershoot, overflowed: true });
    }
  });
});
