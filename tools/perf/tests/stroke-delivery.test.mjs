import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeMatrix } from '../gen-performance-matrix.mjs';
import { strokeDeliveryProblem, trustedPointerdowns } from '../lib/stroke-delivery.mjs';
import { captureRefusal } from '../split-capture/capture-device-frames.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
// A tracked Android split capture from the issue 2229 A/B: 160 adb swipes, 160
// trusted pointerdowns, fidelity passed.
const DELIVERED = JSON.parse(
  readFileSync(
    join(
      ROOT,
      'perf-profiles/evidence/2026-09-24-issue-2229-portrait-ab-base/crayon-base-r1--2a0a9767.json'
    ),
    'utf8'
  )
);
const EVENT_TYPE = 2;
const POINTERDOWN = 0;
const LOST_STROKES = 20;

// The 3928 portrait captures' shape: the overlay column ate 20 of 160 touches
// before the page saw them, and everything that did arrive was driven well.
function withLostStrokes(artifact, lost) {
  let dropped = 0;
  const events = artifact.report.events.filter((row) => {
    if (row[EVENT_TYPE] !== POINTERDOWN || dropped === lost) return true;
    dropped += 1;
    return false;
  });
  return { ...artifact, report: { ...artifact.report, events } };
}

describe('strokeDeliveryProblem', () => {
  it('passes a capture whose page recorded every dispatched stroke', () => {
    expect(DELIVERED.dispatchedStrokes).toBe(160);
    expect(trustedPointerdowns(DELIVERED.report)).toBe(160);
    expect(strokeDeliveryProblem(DELIVERED)).toBeNull();
    expect(strokeDeliveryProblem(DELIVERED, { required: true })).toBeNull();
  });

  it('fails a capture that lost strokes, naming both counts', () => {
    const problem = strokeDeliveryProblem(withLostStrokes(DELIVERED, LOST_STROKES));

    expect(problem).toContain('recorded 140 pointerdowns for 160 dispatched strokes');
    expect(problem).toMatch(/took touches/);
  });

  it('fails a capture whose page saw more pointerdowns than were dispatched', () => {
    const problem = strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: 150 });

    expect(problem).toContain('recorded 160 pointerdowns for 150 dispatched strokes');
    expect(problem).toMatch(/something other than the capture/);
  });

  it('tolerates an unrecorded count unless the caller knows it was driven through adb', () => {
    const uncounted = { ...DELIVERED, dispatchedStrokes: null };

    expect(strokeDeliveryProblem(uncounted)).toBeNull();
    expect(strokeDeliveryProblem({ report: DELIVERED.report })).toBeNull();
    expect(strokeDeliveryProblem(uncounted, { required: true })).toMatch(
      /160 pointerdowns but no dispatchedStrokes/
    );
  });

  it('refuses a recorded count that is not a stroke count', () => {
    expect(strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: '160' })).toMatch(
      /is not a stroke count/
    );
    expect(strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: -1 })).toMatch(
      /is not a stroke count/
    );
  });
});

// Issue 2271's shape: every one of the 160 strokes arrived, each one 48 CSS px
// below its planned start, because a navigation bar below the page was counted
// above it.
const NAV_BAR_CSS_PX = 48;
const plannedStarts = Array.from({ length: 160 }, (_, index) => [
  20 + (index % 16) * 20,
  80 + Math.floor(index / 16) * 50,
]);
const landed = (dx, dy) => plannedStarts.map(([x, y]) => [x + dx, y + dy]);
const withLanding = (recorded, planned = plannedStarts) => ({
  ...DELIVERED,
  strokeLanding: { planned, recorded },
});

describe('stroke landing', () => {
  it('passes strokes that arrived within a CSS pixel of their planned starts', () => {
    expect(strokeDeliveryProblem(withLanding(landed(0.17, -0.16)))).toBeNull();
  });

  it('fails strokes that all landed one navigation bar low, naming the offset', () => {
    const problem = strokeDeliveryProblem(withLanding(landed(0, NAV_BAR_CSS_PX)));

    expect(problem).toContain('up to 48 CSS px from their planned points');
    expect(problem).toContain('median offset x 0, y 48');
  });

  it('fails a single stroke that landed off its plan', () => {
    const recorded = landed(0, 0);
    recorded[37] = [recorded[37][0] + 2, recorded[37][1]];

    expect(strokeDeliveryProblem(withLanding(recorded))).toContain('up to 2 CSS px');
  });

  it('fails a planned capture whose page recorded no positions', () => {
    expect(strokeDeliveryProblem(withLanding(null))).toMatch(/no pointerdown positions/);
  });

  it('fails when the positions and the plan disagree in length', () => {
    expect(strokeDeliveryProblem(withLanding(landed(0, 0).slice(1)))).toContain(
      '159 pointerdown positions for 160 planned strokes'
    );
  });

  it('leaves the count rule to report lost strokes first', () => {
    const problem = strokeDeliveryProblem({
      ...withLostStrokes(DELIVERED, LOST_STROKES),
      strokeLanding: { planned: plannedStarts, recorded: landed(0, NAV_BAR_CSS_PX).slice(20) },
    });

    expect(problem).toContain('recorded 140 pointerdowns for 160 dispatched strokes');
  });

  it('refuses the capture through captureRefusal', () => {
    expect(captureRefusal(withLanding(landed(NAV_BAR_CSS_PX, 0)))).toMatch(
      /Stroke delivery failed: strokes landed up to 48 CSS px/
    );
  });
});

describe('captureRefusal', () => {
  it('lets a delivered, faithful capture through', () => {
    expect(DELIVERED.fidelity.passed).toBe(true);
    expect(captureRefusal(DELIVERED)).toBeNull();
  });

  it('refuses a capture that lost strokes even though its fidelity passed', () => {
    const refusal = captureRefusal(withLostStrokes(DELIVERED, LOST_STROKES));

    expect(refusal).toContain('140 pointerdowns for 160 dispatched strokes');
    expect(refusal).not.toMatch(/fidelity gate/);
    expect(refusal).toMatch(/Do not score it\.$/);
  });

  it('names both failures when a capture lost strokes and failed fidelity', () => {
    const refusal = captureRefusal({
      ...withLostStrokes(DELIVERED, LOST_STROKES),
      fidelity: { ...DELIVERED.fidelity, passed: false },
    });

    expect(refusal).toContain('140 pointerdowns for 160 dispatched strokes');
    expect(refusal).toMatch(/fidelity gate/);
  });

  it('refuses an iPad capture only on its fidelity, since it counts no strokes', () => {
    const ipad = { ...DELIVERED, dispatchedStrokes: null };

    expect(captureRefusal(ipad)).toBeNull();
    expect(captureRefusal({ ...ipad, fidelity: { passed: false } })).toMatch(/fidelity gate/);
  });
});

// A tracked pen capture from the same campaign, which also drove the undo pass,
// so the fold can read it as a mode's undo source.
const UNDO_DELIVERED = JSON.parse(
  readFileSync(
    join(
      ROOT,
      'perf-profiles/evidence/2026-09-25-issue-2229-android-device-web-portrait/pen-real-screen--3aef348d.json'
    ),
    'utf8'
  )
);

// Issue 2342: campaign acceptance refused the 140/160 capture, but a manifest
// naming it directly folded it as a scoreable cell with verified fidelity.
describe('the performance-matrix fold', () => {
  const directories = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  function fold({ crayon = null, undo = null }) {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-stroke-delivery-'));
    directories.push(directory);
    const captured = {
      id: 'portrait-light',
      orientation: 'PORTRAIT',
      theme: 'light',
      status: 'captured',
      drawing: {},
    };
    if (crayon) {
      writeFileSync(join(directory, 'crayon.json'), JSON.stringify(crayon));
      captured.drawing.crayon = ['crayon.json'];
    }
    if (undo) {
      writeFileSync(join(directory, 'pen.json'), JSON.stringify(undo));
      captured.undoSource = 'pen.json';
    }
    const unavailable = [
      { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
      { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
      { id: 'landscape-dark', orientation: 'LANDSCAPE', theme: 'dark' },
    ].map((spec) => ({ ...spec, status: 'unavailable', reason: 'not exercised here' }));
    const matrix = normalizeMatrix(
      {
        schemaVersion: 3,
        recordedOn: '2026-09-25',
        productCommit: '0000000000000000000000000000000000000000',
        snapshotKind: 'test',
        architecture: 'test',
        targets: [
          {
            id: 'android-device-web',
            label: 'android-device-web',
            fidelity: 'advisory',
            modes: [captured, ...unavailable],
          },
        ],
      },
      directory
    );
    return matrix.targets[0].modes[0];
  }

  it('folds a capture whose page recorded every dispatched stroke as scoreable', () => {
    const mode = fold({ crayon: DELIVERED });

    expect(mode.drawing.crayon.aggregate.scoreable).toBe(true);
    expect(mode.drawing.crayon.runs[0].trust).toContainEqual({
      name: 'inputFidelity',
      state: 'verified',
    });
  });

  it('refuses a drawing capture that lost strokes, naming both counts', () => {
    expect(() => fold({ crayon: withLostStrokes(DELIVERED, LOST_STROKES) })).toThrow(
      /crayon\.json failed stroke delivery: the page recorded 140 pointerdowns for 160 dispatched strokes/
    );
  });

  it('folds a delivered undo source and refuses one that lost strokes', () => {
    expect(trustedPointerdowns(UNDO_DELIVERED.report)).toBe(UNDO_DELIVERED.dispatchedStrokes);
    expect(fold({ undo: UNDO_DELIVERED }).undo).toMatchObject({ source: 'pen.json' });
    expect(() => fold({ undo: withLostStrokes(UNDO_DELIVERED, LOST_STROKES) })).toThrow(
      /pen\.json failed stroke delivery: the page recorded 140 pointerdowns for 160/
    );
  });

  it('folds a transport that records no dispatched count as before', () => {
    const uncounted = { ...withLostStrokes(DELIVERED, LOST_STROKES), dispatchedStrokes: null };

    expect(fold({ crayon: uncounted }).drawing.crayon.aggregate.scoreable).toBe(true);
  });
});
